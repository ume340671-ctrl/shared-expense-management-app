import { getSupabase } from "@/lib/supabase";
import { friendsError } from "@/lib/friends";
import type { FriendsAction, FriendsSnapshot } from "@/types/friends";

export type FriendsConnection = "connecting" | "live" | "offline";

export interface FriendsService {
  load(periodId?: string | null): Promise<FriendsSnapshot>;
  mutate(periodId: string, action: FriendsAction, data?: Record<string, unknown>): Promise<string>;
  subscribe(listener: () => void, onStatus: (status: FriendsConnection) => void): () => void;
}

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Connectez Supabase pour utiliser les dépenses entre amis. Aucune donnée de ce module n'est stockée uniquement dans le navigateur.");
  return supabase;
}

function rpcError(error: { code?: string; message: string }): Error {
  return new Error(friendsError(new Error(`${error.code ?? ""} ${error.message}`)));
}

/** No local business-data fallback: PostgreSQL is the only source of truth. */
export const friendsService: FriendsService = {
  async load(periodId = null) {
    const { data, error } = await client().rpc("friends_snapshot", { p_period_id: periodId });
    if (error) throw rpcError(error);
    if (!data) throw new Error("Aucune période disponible. Vérifiez la migration du module amis.");
    return data as FriendsSnapshot;
  },

  async mutate(periodId, action, payload = {}) {
    const { data, error } = await client().rpc("friends_mutate", {
      p_period_id: periodId, p_action: action, p_data: payload,
    });
    if (error) throw rpcError(error);
    return data as string;
  },

  subscribe(listener, onStatus) {
    const supabase = getSupabase();
    if (!supabase) {
      onStatus("offline");
      return () => {};
    }
    onStatus("connecting");
    const channel = supabase.channel(`friends-ledger-${crypto.randomUUID()}`);
    for (const table of ["friend_members", "friend_periods", "friend_expenses", "friend_settlements"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, listener);
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        onStatus("live");
        listener();
      } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        onStatus("offline");
      }
    });
    return () => { void supabase.removeChannel(channel); };
  },
};