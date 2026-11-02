import type { AuditAction, AuditLog } from "@/types";
import {
  FIELD_LABELS,
  formatAuditTimestamp,
  formatAuditValue,
  visibleAuditFields,
} from "@/lib/auditFormat";
import { Modal } from "./Modal";

const ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: "Ajout",
  UPDATE: "Modification",
  DELETE: "Suppression",
  UPLOAD: "Photo",
};

const ACTION_STYLES: Record<AuditAction, string> = {
  CREATE: "border-accent/40 bg-accent-soft text-accent-text",
  UPDATE: "border-line-strong bg-surface-2 text-ink-secondary",
  DELETE: "border-danger/40 bg-danger-soft text-danger",
  UPLOAD: "border-accent/40 bg-accent-soft text-accent-text",
};

/** Badge d'action */
export function ActionBadge({ action }: { action: AuditAction }) {
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] ${ACTION_STYLES[action]}`}
    >
      {ACTION_LABELS[action]}
    </span>
  );
}

/** Détail complet d'un événement d'audit (lecture seule) */
export function AuditDetailModal({
  log,
  onClose,
}: {
  log: AuditLog | null;
  onClose: () => void;
}) {
  const oldFields = visibleAuditFields(log?.old_values ?? null);
  const newFields = visibleAuditFields(log?.new_values ?? null);
  const allFields = [...new Set([...oldFields, ...newFields])];

  return (
    <Modal
      open={Boolean(log)}
      onClose={onClose}
      title="Détail de l'opération"
      description={log?.summary}
      className="sm:max-w-xl"
    >
      {log && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10.5px] uppercase tracking-[0.16em] text-ink-muted">Utilisateur</p>
              <p className="mt-1 text-[13.5px] text-ink">{log.actor_email ?? "Système"}</p>
            </div>
            <div>
              <p className="text-[10.5px] uppercase tracking-[0.16em] text-ink-muted">
                Date et heure
              </p>
              <p className="mt-1 text-[13.5px] text-ink">{formatAuditTimestamp(log.created_at)}</p>
            </div>
            <div>
              <p className="text-[10.5px] uppercase tracking-[0.16em] text-ink-muted">Action</p>
              <div className="mt-1.5">
                <ActionBadge action={log.action} />
              </div>
            </div>
            <div>
              <p className="text-[10.5px] uppercase tracking-[0.16em] text-ink-muted">Élément</p>
              <p className="mt-1 text-[13.5px] text-ink">
                {log.entity_label ?? "—"}
                <span className="ml-2 text-[12px] text-ink-muted">({log.entity_type})</span>
              </p>
            </div>
          </div>

          {allFields.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-line text-[10.5px] uppercase tracking-[0.14em] text-ink-muted">
                    <th className="px-4 py-2.5 font-medium">Champ</th>
                    <th className="px-4 py-2.5 font-medium">Avant</th>
                    <th className="px-4 py-2.5 font-medium">Après</th>
                  </tr>
                </thead>
                <tbody>
                  {allFields.map((field) => {
                    const before = log.old_values ? log.old_values[field] : undefined;
                    const after = log.new_values ? log.new_values[field] : undefined;
                    const changed = JSON.stringify(before) !== JSON.stringify(after);
                    return (
                      <tr key={field} className="border-b border-line/60 last:border-0">
                        <td className="px-4 py-2.5 text-[12.5px] text-ink-muted">
                          {FIELD_LABELS[field] ?? field}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-[13px] ${changed ? "text-danger line-through/70" : "text-ink-secondary"}`}
                        >
                          {formatAuditValue(field, before)}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-[13px] ${changed ? "font-semibold text-accent-text" : "text-ink-secondary"}`}
                        >
                          {formatAuditValue(field, after)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-xl border border-line bg-surface-2 px-4 py-3.5 text-[13px] text-ink-muted">
              Aucun détail de valeurs enregistré pour cette opération.
            </p>
          )}

          {log.entity_id && (
            <p className="text-[11.5px] text-ink-muted">
              Identifiant de l'élément : <span className="tabular-nums">{log.entity_id}</span>
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
