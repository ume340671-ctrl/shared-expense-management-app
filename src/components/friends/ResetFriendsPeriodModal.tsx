import { useState } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { formatCents, friendsError } from "@/lib/friends";
import type { FriendsSnapshot } from "@/types/friends";

export function ResetFriendsPeriodModal({ data, expectedPeriodId, onReset, onClose }: {
  data: FriendsSnapshot; expectedPeriodId: string;
  onReset: () => Promise<void>; onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = data.balances.some((b) => b.balance_cents !== 0);
  const remaining = data.balances.reduce((sum, b) => sum + Math.max(0, b.balance_cents), 0);
  const changed = data.period.id !== expectedPeriodId || Boolean(data.period.closed_at);
  const empty = data.expenses.length === 0 && data.settlements.length === 0;
  const blocked = pending || changed || empty;

  const reset = async () => {
    if (blocked || !confirmed) return;
    setBusy(true); setError(null);
    try { await onReset(); onClose(); }
    catch (err) { setError(friendsError(err)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title="Réinitialiser les dépenses entre amis ?"
      description="La période actuelle sera archivée, pas supprimée.">
      <div className="space-y-5">
        {changed ? <p role="alert" className="text-[13px] text-danger">La période a changé sur un autre appareil. Fermez cette fenêtre et actualisez les données.</p>
          : pending ? (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-4">
              <p className="flex items-center gap-2 text-[14px] font-semibold"><AlertTriangle className="h-4 w-4 shrink-0 text-danger" />Des remboursements restent à effectuer</p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">Il reste {formatCents(remaining)} à rembourser. Enregistrez les paiements réellement effectués avant de commencer une nouvelle période.</p>
              <ul className="mt-3 space-y-1.5 text-[12.5px]">
                {data.balances.filter((b) => b.balance_cents < 0).map((b) => <li key={b.member_id}>{data.members.find((m) => m.id === b.member_id)?.full_name} : {formatCents(-b.balance_cents)} à rembourser</li>)}
              </ul>
            </div>
          ) : empty ? <p className="rounded-xl border border-line bg-surface p-4 text-[13px] text-ink-secondary">La période est déjà vide. Vous pouvez ajouter une nouvelle dépense sans réinitialiser.</p> : (
            <p className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft p-4 text-[13.5px] text-accent-text"><CheckCircle2 className="h-4 w-4 shrink-0" />Tous les soldes sont à zéro.</p>
          )}
        <div className="space-y-2 text-[13px] leading-relaxed text-ink-secondary">
          <p>Vos dépenses et remboursements resteront consultables dans l'historique. La nouvelle période démarrera avec des dépenses et des soldes à zéro.</p>
          <p className="font-medium text-ink">Les achats de la maison, leurs photos et les autres rubriques ne seront pas modifiés.</p>
        </div>
        {!blocked && <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-ink-secondary">
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-accent" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          J'ai vérifié que tous les remboursements sont terminés.
        </label>}
        {error && <p role="alert" className="text-[13px] leading-relaxed text-danger">{error}</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={busy} onClick={onClose}>Annuler</Button>
          <Button loading={busy} disabled={blocked || !confirmed} onClick={() => { void reset(); }}><RotateCcw className="h-4 w-4" />Archiver et recommencer</Button>
        </div>
        <p className="text-[11.5px] leading-relaxed text-ink-muted">Les soldes seront à nouveau vérifiés par Supabase au moment de la confirmation.</p>
      </div>
    </Modal>
  );
}