import type {
  AuditClearPreview,
  AuditLog,
  AuditPage,
  AuditQuery,
  Housemate,
  PurchaseInput,
  PurchaseWithBuyer,
} from "@/types";
import { HOUSEMATES, SHARED_ACCOUNT_EMAIL } from "@/lib/config";
import { AUDIT_CLEAR_CONFIRMATION } from "@/lib/auditClear";
import { normalize } from "@/lib/filters";
import {
  auditPhotoSummary,
  auditSummaries,
  auditUpdateSummary,
  describePurchaseChanges,
} from "@/lib/auditFormat";
import type { DataService } from "./dataService";

/**
 * Implémentation locale de secours (localStorage).
 *
 * Elle n'est utilisée que lorsque les variables d'environnement Supabase
 * sont absentes, afin que l'application reste exécutable en local.
 * En production, les données sont toujours stockées dans Supabase.
 * Les données saisies sont réelles et persistent dans le navigateur.
 */

const HOUSEMATES_KEY = "t9dya.housemates.v1";
const PURCHASES_KEY = "t9dya.purchases.v1";
const AUDIT_KEY = "t9dya.audit.v1";
const AUDIT_PURGES_KEY = "t9dya.audit-purges.v1";
const AUDIT_REQUESTS_KEY = "t9dya.audit-clear-requests.v1";
const LOCAL_SESSION_KEY = "t9dya.local-session.v1";
const CHANGE_EVENT = "t9dya:data-change";
const AUDIT_EVENT = "t9dya:audit-change";

/** Auteur de l'action : e-mail de la session locale (mode secours) */
function currentActorEmail(): string | null {
  return localStorage.getItem(LOCAL_SESSION_KEY);
}

/** Valeurs journalisées d'un achat (sans les champs de jointure) */
function purchaseValues(purchase: PurchaseWithBuyer): Record<string, unknown> {
  const { buyer_name: _buyerName, ...values } = purchase;
  return values as Record<string, unknown>;
}

/** Ajoute un événement au journal local */
function appendAudit(entry: {
  action: AuditLog["action"];
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  summary: string;
}): void {
  const logs = read<AuditLog>(AUDIT_KEY);
  logs.push({
    id: createId(),
    actor_id: null,
    actor_email: currentActorEmail(),
    created_at: new Date().toISOString(),
    ...entry,
  });
  write(AUDIT_KEY, logs);
  window.dispatchEvent(new CustomEvent(AUDIT_EVENT));
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Initialisation idempotente : les quatre colocataires existent toujours, sans doublon. */
function ensureHousemates(): Housemate[] {
  let housemates = read<Housemate>(HOUSEMATES_KEY);
  let created = false;
  for (const fullName of HOUSEMATES) {
    if (!housemates.some((h) => h.full_name === fullName)) {
      housemates.push({
        id: createId(),
        full_name: fullName,
        created_at: new Date().toISOString(),
      });
      created = true;
    }
  }
  if (created) write(HOUSEMATES_KEY, housemates);
  return housemates.sort((a, b) => a.full_name.localeCompare(b.full_name));
}

function joinBuyer(purchase: PurchaseWithBuyer, housemates: Housemate[]): PurchaseWithBuyer {
  const buyer = housemates.find((h) => h.id === purchase.buyer_id);
  return { ...purchase, buyer_name: buyer?.full_name ?? "Colocataire inconnu" };
}

function sortPurchases(purchases: PurchaseWithBuyer[]): PurchaseWithBuyer[] {
  return [...purchases].sort(
    (a, b) =>
      b.purchase_date.localeCompare(a.purchase_date) || b.created_at.localeCompare(a.created_at),
  );
}

export const localDataService: DataService = {
  async listHousemates(): Promise<Housemate[]> {
    return ensureHousemates();
  },

  async listPurchases(): Promise<PurchaseWithBuyer[]> {
    const housemates = ensureHousemates();
    const purchases = read<PurchaseWithBuyer>(PURCHASES_KEY).map((p) => joinBuyer(p, housemates));
    return sortPurchases(purchases);
  },

  async createPurchase(input: PurchaseInput): Promise<PurchaseWithBuyer> {
    const housemates = ensureHousemates();
    const purchases = read<PurchaseWithBuyer>(PURCHASES_KEY);
    const now = new Date().toISOString();
    const created: PurchaseWithBuyer = {
      id: createId(),
      item_name: input.item_name.trim(),
      unit_price: input.unit_price,
      quantity: input.quantity,
      buyer_id: input.buyer_id,
      purchase_date: input.purchase_date,
      notes: input.notes?.trim() ? input.notes.trim() : null,
      photo_path: null,
      created_at: now,
      updated_at: now,
      buyer_name: housemates.find((h) => h.id === input.buyer_id)?.full_name ?? "",
    };
    purchases.push(created);
    write(PURCHASES_KEY, purchases);

    // Journal d'audit (mode local — en production, les triggers SQL s'en chargent)
    appendAudit({
      action: "CREATE",
      entity_type: "purchase",
      entity_id: created.id,
      entity_label: created.item_name,
      old_values: null,
      new_values: purchaseValues(joinBuyer(created, housemates)),
      summary: auditSummaries(currentActorEmail(), joinBuyer(created, housemates)).created,
    });

    return joinBuyer(created, housemates);
  },

  async updatePurchase(id: string, input: PurchaseInput): Promise<PurchaseWithBuyer> {
    const housemates = ensureHousemates();
    const purchases = read<PurchaseWithBuyer>(PURCHASES_KEY);
    const index = purchases.findIndex((p) => p.id === id);
    if (index === -1) throw new Error("Achat introuvable.");
    const previous = purchases[index];
    const updated: PurchaseWithBuyer = {
      ...previous,
      item_name: input.item_name.trim(),
      unit_price: input.unit_price,
      quantity: input.quantity,
      buyer_id: input.buyer_id,
      purchase_date: input.purchase_date,
      notes: input.notes?.trim() ? input.notes.trim() : null,
      updated_at: new Date().toISOString(),
      buyer_name: housemates.find((h) => h.id === input.buyer_id)?.full_name ?? "",
    };
    purchases[index] = updated;
    write(PURCHASES_KEY, purchases);

    const withBuyer = joinBuyer(updated, housemates);
    const changes = describePurchaseChanges(previous, withBuyer);
    if (changes.length > 0) {
      appendAudit({
        action: "UPDATE",
        entity_type: "purchase",
        entity_id: updated.id,
        entity_label: updated.item_name,
        old_values: purchaseValues(previous),
        new_values: purchaseValues(withBuyer),
        summary: auditUpdateSummary(currentActorEmail(), withBuyer, changes),
      });
    }

    return joinBuyer(updated, housemates);
  },

  async deletePurchase(id: string): Promise<void> {
    const purchases = read<PurchaseWithBuyer>(PURCHASES_KEY);
    const target = purchases.find((p) => p.id === id);
    write(
      PURCHASES_KEY,
      purchases.filter((p) => p.id !== id),
    );

    if (target) {
      appendAudit({
        action: "DELETE",
        entity_type: "purchase",
        entity_id: target.id,
        entity_label: target.item_name,
        old_values: purchaseValues(target),
        new_values: null,
        summary: auditSummaries(currentActorEmail(), target).deleted,
      });
    }
  },

  async setPurchasePhoto(id: string, photoPath: string | null): Promise<void> {
    const purchases = read<PurchaseWithBuyer>(PURCHASES_KEY);
    const index = purchases.findIndex((p) => p.id === id);
    if (index === -1) throw new Error("Achat introuvable.");

    const before = purchases[index];
    const updated: PurchaseWithBuyer = {
      ...before,
      photo_path: photoPath,
      updated_at: new Date().toISOString(),
    };
    purchases[index] = updated;
    write(PURCHASES_KEY, purchases);

    if (before.photo_path !== photoPath) {
      const withBuyer = joinBuyer(updated, ensureHousemates());

      // 1. Événement « photo » (ajout / remplacement / suppression du fichier)
      appendAudit({
        action: photoPath ? "UPLOAD" : "DELETE",
        entity_type: "photo",
        entity_id: updated.id,
        entity_label: updated.item_name,
        old_values: before.photo_path ? { path: before.photo_path } : null,
        new_values: photoPath ? { path: photoPath } : null,
        summary: auditPhotoSummary(
          currentActorEmail(),
          photoPath ? (before.photo_path ? "replaced" : "added") : "removed",
          updated.item_name,
        ),
      });

      // 2. Événement « achat » (la référence photo_path a changé)
      appendAudit({
        action: "UPDATE",
        entity_type: "purchase",
        entity_id: updated.id,
        entity_label: updated.item_name,
        old_values: purchaseValues(before),
        new_values: purchaseValues(withBuyer),
        summary: auditUpdateSummary(currentActorEmail(), withBuyer, [
          photoPath ? (before.photo_path ? "photo remplacée" : "photo ajoutée") : "photo retirée",
        ]),
      });
    }
  },

  async listAuditLogs(query: AuditQuery): Promise<AuditPage> {
    let items = read<AuditLog>(AUDIT_KEY).sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );

    if (query.action !== "all") {
      items = items.filter((log) => log.action === query.action);
    }
    if (query.actor !== "all") {
      items = items.filter((log) => log.actor_email === query.actor);
    }
    if (query.month !== "all") {
      items = items.filter((log) => log.created_at.slice(0, 7) === query.month);
    }
    const search = normalize(query.search);
    if (search) {
      items = items.filter(
        (log) =>
          normalize(log.actor_email ?? "").includes(search) ||
          normalize(log.entity_label ?? "").includes(search) ||
          normalize(log.summary).includes(search),
      );
    }

    const total = items.length;
    const from = (query.page - 1) * query.pageSize;
    return { items: items.slice(from, from + query.pageSize), total };
  },

  async listAuditActors(): Promise<string[]> {
    const logs = read<AuditLog>(AUDIT_KEY);
    const actors = logs
      .map((log) => log.actor_email)
      .filter((email): email is string => Boolean(email));
    return [...new Set(actors)];
  },

  async previewAuditClear(): Promise<AuditClearPreview> {
    if (currentActorEmail() !== SHARED_ACCOUNT_EMAIL) throw new Error("AUDIT_CLEAR_FORBIDDEN");
    const cutoff = new Date().toISOString();
    const request_id = createId();
    const event_ids = read<AuditLog>(AUDIT_KEY).filter((log) => new Date(log.created_at).getTime() <= new Date(cutoff).getTime()).map((log) => log.id);
    const requests = read<{ id: string; cutoff: string; event_ids: string[] }>(AUDIT_REQUESTS_KEY)
      .filter((request) => new Date(request.cutoff).getTime() >= Date.now() - 30 * 60 * 1000);
    write(AUDIT_REQUESTS_KEY, [...requests, { id: request_id, cutoff, event_ids }]);
    return { request_id, cutoff, count: event_ids.length };
  },

  async clearAuditHistory(preview: AuditClearPreview, confirmation: string): Promise<number> {
    if (currentActorEmail() !== SHARED_ACCOUNT_EMAIL) throw new Error("AUDIT_CLEAR_FORBIDDEN");
    if (confirmation.trim() !== AUDIT_CLEAR_CONFIRMATION) throw new Error("AUDIT_CLEAR_CONFIRMATION");
    const receipts = read<{ id: string; cutoff: string; removed_count: number; actor_email: string; created_at: string }>(AUDIT_PURGES_KEY);
    const previous = receipts.find((receipt) => receipt.id === preview.request_id);
    if (previous) {
      if (previous.cutoff !== preview.cutoff) throw new Error("AUDIT_CLEAR_INVALID_REQUEST");
      return previous.removed_count;
    }
    const requests = read<{ id: string; cutoff: string; event_ids: string[] }>(AUDIT_REQUESTS_KEY);
    const request = requests.find((item) => item.id === preview.request_id);
    if (!request || request.cutoff !== preview.cutoff) throw new Error("AUDIT_CLEAR_INVALID_REQUEST");
    const cutoff = new Date(preview.cutoff).getTime();
    if (!preview.request_id || !Number.isFinite(cutoff) || cutoff > Date.now() || cutoff < Date.now() - 30 * 60 * 1000) throw new Error("AUDIT_CLEAR_EXPIRED");
    const logs = read<AuditLog>(AUDIT_KEY);
    const ids = new Set(request.event_ids);
    const retained = logs.filter((log) => !ids.has(log.id));
    const count = logs.length - retained.length;
    write(AUDIT_KEY, retained);
    write(AUDIT_PURGES_KEY, [...receipts, { id: preview.request_id, cutoff: preview.cutoff, removed_count: count, actor_email: SHARED_ACCOUNT_EMAIL, created_at: new Date().toISOString() }]);
    write(AUDIT_REQUESTS_KEY, requests.filter((item) => item.id !== preview.request_id));
    window.dispatchEvent(new CustomEvent(AUDIT_EVENT));
    return count;
  },

  subscribeToAuditChanges(listener: () => void): () => void {
    const onLocal = () => listener();
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUDIT_KEY) listener();
    };
    window.addEventListener(AUDIT_EVENT, onLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AUDIT_EVENT, onLocal);
      window.removeEventListener("storage", onStorage);
    };
  },

  subscribeToChanges(listener: () => void): () => void {
    const onLocal = () => listener();
    const onStorage = (event: StorageEvent) => {
      if (event.key === PURCHASES_KEY) listener();
    };
    window.addEventListener(CHANGE_EVENT, onLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onLocal);
      window.removeEventListener("storage", onStorage);
    };
  },
};
