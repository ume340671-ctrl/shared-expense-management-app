import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { AuditClearPreview } from "@/types";
import { AUDIT_CLEAR_CONFIRMATION, auditClearError } from "@/lib/auditClear";
import { Modal } from "./Modal";
import { Button } from "./Button";

export function AuditClearDialog({ onClose, onPrepare, onConfirm, onCleared }: {
  onClose: () => void;
  onPrepare: () => Promise<AuditClearPreview>;
  onConfirm: (preview: AuditClearPreview, confirmation: string) => Promise<number>;
  onCleared: (count: number) => void;
}) {
  const [preview, setPreview] = useState<AuditClearPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setPreparing(true); setError(null); setConfirmation(""); setPreview(null);
    onPrepare().then((result) => { if (active) setPreview(result); })
      .catch((err: unknown) => { if (active) setError(auditClearError(err)); })
      .finally(() => { if (active) setPreparing(false); });
    return () => { active = false; };
  }, [onPrepare, attempt]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!preview || preview.count === 0 || confirmation.trim() !== AUDIT_CLEAR_CONFIRMATION || preparing || busy) return;
    setBusy(true); setError(null);
    try {
      const count = await onConfirm(preview, confirmation);
      onCleared(count);
      onClose();
    } catch (err) { setError(auditClearError(err)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title="Supprimer l'historique d'audit ?"
      description="Cette suppression est définitive et concerne toutes les rubriques du journal.">
      <form className="space-y-5" noValidate onSubmit={(event) => { void submit(event); }}>
        <div className="rounded-xl border border-danger/30 bg-danger-soft p-4">
          <p className="flex items-start gap-2.5 text-[13.5px] font-medium text-ink"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />Les événements masqués par vos filtres sont également concernés.</p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">Aucun achat, photo, participant, remboursement ou période de dépenses ne sera supprimé. La journalisation des nouvelles opérations restera active.</p>
        </div>

        {preparing ? <p role="status" className="text-[13px] text-ink-muted">Préparation de la confirmation par le serveur...</p> : preview && (
          <div className="space-y-2 text-[13px] leading-relaxed text-ink-secondary">
            <p className="font-medium text-ink">{preview.count === 0 ? "Aucun événement à supprimer dans cette confirmation." : `${preview.count} événement${preview.count > 1 ? "s" : ""} à supprimer.`}</p>
            {preview.count > 0 && <p>La liste a été préparée le {new Date(preview.cutoff).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" })}. Les événements ajoutés pendant cette confirmation seront conservés.</p>}
          </div>
        )}

        {preview && preview.count > 0 && !preparing && <div>
          <label htmlFor="audit-clear-confirmation" className="mb-2 block text-[13px] text-ink-secondary">Saisissez <strong className="font-semibold text-ink">SUPPRIMER</strong> pour confirmer</label>
          <input id="audit-clear-confirmation" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={busy} autoComplete="off" spellCheck={false} placeholder="SUPPRIMER"
            className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-ink-muted focus:border-danger focus:outline-none focus:ring-1 focus:ring-danger" />
        </div>}

        {error && <div role="alert" className="space-y-2 text-[13px] leading-relaxed"><p className="break-words text-danger">{error}</p><button type="button" disabled={busy} onClick={() => setAttempt((current) => current + 1)} className="min-h-10 text-ink-secondary underline underline-offset-4">Recharger la confirmation</button></div>}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button type="submit" variant="danger" loading={busy} disabled={preparing || !preview || preview.count === 0 || confirmation.trim() !== AUDIT_CLEAR_CONFIRMATION}>
            <Trash2 className="h-4 w-4" />Supprimer définitivement
          </Button>
        </div>
        <p className="text-[11.5px] leading-relaxed text-ink-muted">Une trace administrative de la suppression (auteur, date et nombre d'événements) est conservée séparément, sans les anciens détails.</p>
      </form>
    </Modal>
  );
}