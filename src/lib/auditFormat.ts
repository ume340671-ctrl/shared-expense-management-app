import type { Purchase, PurchaseWithBuyer } from "@/types";
import { formatLongDate, formatMoney, parseLocalDate } from "./format";
import { purchaseTotal } from "./stats";

/** Libellés français des champs journalisés */
export const FIELD_LABELS: Record<string, string> = {
  item_name: "Article",
  unit_price: "Prix unitaire",
  quantity: "Quantité",
  buyer_id: "Acheteur",
  purchase_date: "Date",
  notes: "Remarque",
  photo_path: "Photo",
  path: "Chemin du fichier",
  id: "Identifiant",
  created_at: "Créé le",
  updated_at: "Modifié le",
  description: "Dépense entre amis",
  amount_cents: "Montant",
  payer_id: "Payeur",
  participant_ids: "Participants",
  incurred_on: "Date de la dépense",
  paid_on: "Date du remboursement",
  from_member_id: "Remboursé par",
  to_member_id: "Remboursé à",
  period_id: "Période",
  number: "Numéro de période",
  full_name: "Nom du participant",
  started_at: "Début de période",
  closed_at: "Clôture de période",
  created_by: "Créé par",
  closed_by: "Clôturé par",
};

/** Champs techniques jamais affichés dans le détail d'un événement */
const TECHNICAL_FIELDS = new Set(["id", "created_at", "updated_at"]);

/** Formate une valeur journalisée pour l'affichage */
export function formatAuditValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";

  if (key === "unit_price" && typeof value === "number") return formatMoney(value);
  if (key === "amount_cents" && typeof value === "number") return formatMoney(value / 100);
  if (["purchase_date", "incurred_on", "paid_on"].includes(key) && typeof value === "string") {
    try {
      return formatLongDate(value);
    } catch {
      return value;
    }
  }
  if (key === "photo_path") return "photo présente";
  if (["created_at", "updated_at", "started_at", "closed_at"].includes(key) && typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return String(value);
}

/** Champs métier à afficher dans le détail (hors champs techniques) */
export function visibleAuditFields(
  values: Record<string, unknown> | null,
): string[] {
  if (!values) return [];
  return Object.keys(values).filter((key) => !TECHNICAL_FIELDS.has(key));
}

/** Décrit les différences entre deux versions d'un achat (mêmes règles que le trigger SQL) */
export function describePurchaseChanges(
  old: Purchase,
  next: Purchase,
): string[] {
  const changes: string[] = [];

  if (old.item_name !== next.item_name) {
    changes.push(`nom : « ${old.item_name} » → « ${next.item_name} »`);
  }
  if (old.unit_price !== next.unit_price) {
    changes.push(`prix unitaire : ${formatMoney(old.unit_price)} → ${formatMoney(next.unit_price)}`);
  }
  if (old.quantity !== next.quantity) {
    changes.push(`quantité : ${old.quantity} → ${next.quantity}`);
  }
  if (old.purchase_date !== next.purchase_date) {
    changes.push(
      `date : ${formatLongDate(old.purchase_date)} → ${formatLongDate(next.purchase_date)}`,
    );
  }
  if (old.buyer_id !== next.buyer_id) {
    changes.push("acheteur modifié");
  }
  if ((old.notes ?? "") !== (next.notes ?? "")) {
    changes.push("remarque modifiée");
  }
  if (old.photo_path !== next.photo_path) {
    if (!next.photo_path) changes.push("photo retirée");
    else if (!old.photo_path) changes.push("photo ajoutée");
    else changes.push("photo remplacée");
  }

  return changes;
}

/** Résumés lisibles (mode local de secours, alignés sur les messages du trigger SQL) */
export function auditSummaries(
  actorEmail: string | null,
  purchase: PurchaseWithBuyer,
) {
  const actor = actorEmail ?? "un utilisateur";
  return {
    created: `${actor} a ajouté l'achat « ${purchase.item_name} » (${formatMoney(
      purchaseTotal(purchase),
    )})`,
    deleted: `${actor} a supprimé l'achat « ${purchase.item_name} » (${formatMoney(
      purchaseTotal(purchase),
    )})`,
  };
}

/** Résumé d'une modification */
export function auditUpdateSummary(
  actorEmail: string | null,
  purchase: PurchaseWithBuyer,
  changes: string[],
): string {
  const actor = actorEmail ?? "un utilisateur";
  const details = changes.length > 0 ? ` : ${changes.join(" · ")}` : "";
  return `${actor} a modifié l'achat « ${purchase.item_name} »${details}`;
}

/** Résumé d'une opération sur photo */
export function auditPhotoSummary(
  actorEmail: string | null,
  action: "added" | "replaced" | "removed",
  itemName: string | null,
): string {
  const actor = actorEmail ?? "un utilisateur";
  const item = itemName ? `« ${itemName} »` : "d'un achat";
  const verb =
    action === "added"
      ? "a ajouté une photo à l'achat"
      : action === "replaced"
        ? "a remplacé la photo de l'achat"
        : "a supprimé la photo de l'achat";
  return `${actor} ${verb} ${item}`;
}

/** Libellé de date/heure complet pour l'audit */
export function formatAuditTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
}

/** Date locale (sans heure) d'un horodatage ISO, pour les filtres */
export function auditTimestampDate(iso: string): Date {
  return parseLocalDate(iso.slice(0, 10));
}
