import type {
  AuditClearPreview,
  AuditLog,
  AuditPage,
  AuditQuery,
  Housemate,
  PurchaseInput,
  PurchaseWithBuyer,
} from "@/types";
import { getSupabase } from "@/lib/supabase";
import { auditClearError } from "@/lib/auditClear";
import type { DataService } from "./dataService";

/** Ligne brute renvoyée par PostgREST pour la jointure purchases -> housemates */
type PurchaseRow = {
  id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  buyer_id: string;
  purchase_date: string;
  notes: string | null;
  photo_path: string | null;
  created_at: string;
  updated_at: string;
  housemates: { full_name: string } | { full_name: string }[] | null;
};

function toPurchase(row: PurchaseRow): PurchaseWithBuyer {
  const relation = Array.isArray(row.housemates) ? row.housemates[0] : row.housemates;
  return {
    id: row.id,
    item_name: row.item_name,
    unit_price: Number(row.unit_price),
    quantity: Number(row.quantity),
    buyer_id: row.buyer_id,
    purchase_date: row.purchase_date,
    notes: row.notes,
    photo_path: row.photo_path ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    buyer_name: relation?.full_name ?? "Colocataire inconnu",
  };
}

const SELECT_PURCHASES = "*, housemates(full_name)";

/**
 * Implémentation Supabase (PostgreSQL + Realtime).
 * La sécurité est garantie par les politiques RLS côté base de données.
 */
export const supabaseDataService: DataService = {
  async listHousemates(): Promise<Housemate[]> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase n'est pas configuré.");
    const { data, error } = await supabase
      .from("housemates")
      .select("*")
      .order("full_name", { ascending: true });
    if (error) throw new Error(`Impossible de charger les colocataires : ${error.message}`);
    return (data ?? []) as Housemate[];
  },

  async listPurchases(): Promise<PurchaseWithBuyer[]> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase n'est pas configuré.");
    const { data, error } = await supabase
      .from("purchases")
      .select(SELECT_PURCHASES)
      .order("purchase_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Impossible de charger les achats : ${error.message}`);
    return (data ?? []).map(toPurchase);
  },

  async createPurchase(input: PurchaseInput): Promise<PurchaseWithBuyer> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase n'est pas configuré.");
    const { data, error } = await supabase
      .from("purchases")
      .insert({
        item_name: input.item_name.trim(),
        unit_price: input.unit_price,
        quantity: input.quantity,
        buyer_id: input.buyer_id,
        purchase_date: input.purchase_date,
        notes: input.notes?.trim() ? input.notes.trim() : null,
      })
      .select(SELECT_PURCHASES)
      .single();
    if (error) throw new Error(`L'achat n'a pas pu être enregistré : ${error.message}`);
    return toPurchase(data as PurchaseRow);
  },

  async updatePurchase(id: string, input: PurchaseInput): Promise<PurchaseWithBuyer> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase n'est pas configuré.");
    const { data, error } = await supabase
      .from("purchases")
      .update({
        item_name: input.item_name.trim(),
        unit_price: input.unit_price,
        quantity: input.quantity,
        buyer_id: input.buyer_id,
        purchase_date: input.purchase_date,
        notes: input.notes?.trim() ? input.notes.trim() : null,
      })
      .eq("id", id)
      .select(SELECT_PURCHASES)
      .single();
    if (error) throw new Error(`L'achat n'a pas pu être modifié : ${error.message}`);
    return toPurchase(data as PurchaseRow);
  },

  async deletePurchase(id: string): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase n'est pas configuré.");
    const { error } = await supabase.from("purchases").delete().eq("id", id);
    if (error) throw new Error(`L'achat n'a pas pu être supprimé : ${error.message}`);
  },

  async setPurchasePhoto(id: string, photoPath: string | null): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase n'est pas configuré.");
    const { error } = await supabase
      .from("purchases")
      .update({ photo_path: photoPath })
      .eq("id", id);
    if (error) throw new Error(`La photo n'a pas pu être associée : ${error.message}`);
  },

  async listAuditLogs(query: AuditQuery): Promise<AuditPage> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase n'est pas configuré.");

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let request = supabase
      .from("audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (query.action !== "all") {
      request = request.eq("action", query.action);
    }
    if (query.actor !== "all") {
      request = request.eq("actor_email", query.actor);
    }
    if (query.month !== "all") {
      const [year, month] = query.month.split("-").map(Number);
      const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
      const end = new Date(Date.UTC(year, month, 1)).toISOString();
      request = request.gte("created_at", start).lt("created_at", end);
    }
    const search = query.search.trim();
    if (search) {
      const escaped = search.replace(/[%,()]/g, " ");
      request = request.or(
        `actor_email.ilike.%${escaped}%,entity_label.ilike.%${escaped}%,summary.ilike.%${escaped}%`,
      );
    }

    const { data, error, count } = await request.range(from, to);
    if (error) {
      throw new Error(`Impossible de charger le journal d'audit : ${error.message}`);
    }
    return {
      items: (data ?? []) as AuditLog[],
      total: count ?? 0,
    };
  },

  async listAuditActors(): Promise<string[]> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase n'est pas configuré.");
    const { data, error } = await supabase
      .from("audit_logs")
      .select("actor_email")
      .not("actor_email", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      throw new Error(`Impossible de charger les utilisateurs du journal : ${error.message}`);
    }
    const actors = (data ?? [])
      .map((row) => (row as { actor_email: string | null }).actor_email)
      .filter((email): email is string => Boolean(email));
    return [...new Set(actors)];
  },

  async previewAuditClear(): Promise<AuditClearPreview> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase n'est pas configuré.");
    const { data, error } = await supabase.rpc("preview_audit_history_clear");
    if (error) throw new Error(auditClearError(new Error(`${error.code} ${error.message}`)));
    return data as AuditClearPreview;
  },

  async clearAuditHistory(preview: AuditClearPreview, confirmation: string): Promise<number> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase n'est pas configuré.");
    const { data, error } = await supabase.rpc("clear_audit_history", {
      p_request_id: preview.request_id,
      p_cutoff: preview.cutoff,
      p_confirmation: confirmation,
    });
    if (error) throw new Error(auditClearError(new Error(`${error.code} ${error.message}`)));
    const count = Number(data);
    if (data === null || !Number.isSafeInteger(count) || count < 0) throw new Error("La suppression n'a pas pu être confirmée par le serveur.");
    return count;
  },

  subscribeToAuditChanges(listener: () => void): () => void {
    const supabase = getSupabase();
    if (!supabase) return () => {};

    const channel = supabase
      .channel("t9dya-audit-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs" },
        () => listener(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_history_purges" },
        () => listener(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },

  subscribeToChanges(listener: () => void): () => void {
    const supabase = getSupabase();
    if (!supabase) return () => {};

    const channel = supabase
      .channel("t9dya-purchases-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchases" },
        () => listener(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
