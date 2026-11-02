import { useCallback, useEffect, useRef, useState } from "react";
import { friendsError } from "@/lib/friends";
import { friendsService, type FriendsConnection } from "@/services/friendsService";
import type { FriendsAction, FriendsSnapshot } from "@/types/friends";

export function useFriends() {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<FriendsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<FriendsConnection>("connecting");
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestId.current;
    try {
      const next = await friendsService.load(selectedPeriodId);
      if (request !== requestId.current) return;
      setSnapshot(next);
      setError(null);
    } catch (err) {
      if (request === requestId.current) setError(friendsError(err));
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [selectedPeriodId]);

  useEffect(() => {
    setLoading(true);
    setSnapshot(null);
    void refresh();
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { void refresh(); }, 120);
    };
    const unsubscribe = friendsService.subscribe(schedule, setConnection);
    const onOnline = () => { void refresh(); };
    window.addEventListener("online", onOnline);
    return () => {
      requestId.current += 1;
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, [refresh]);

  const mutate = useCallback(async (action: FriendsAction, data: Record<string, unknown> = {}, expectedPeriodId?: string) => {
    if (!snapshot || snapshot.period.closed_at) throw new Error("Cette période est en lecture seule.");
    if (expectedPeriodId && expectedPeriodId !== snapshot.period.id) throw new Error(friendsError(new Error("FRIENDS_STALE_RECORD")));
    const result = await friendsService.mutate(snapshot.period.id, action, data);
    // Refresh errors are displayed separately; never repeat a successful write.
    await refresh();
    return result;
  }, [snapshot, refresh]);

  return { snapshot, loading, error, connection, selectedPeriodId, selectPeriod: setSelectedPeriodId, refresh, mutate };
}