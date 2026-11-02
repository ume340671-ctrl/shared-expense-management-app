import { useCallback, useEffect, useRef, useState } from "react";
import type { Housemate, PurchaseInput, PurchaseWithBuyer } from "@/types";
import { dataService } from "@/services/dataService";

type DataState = {
  housemates: Housemate[];
  purchases: PurchaseWithBuyer[];
  loading: boolean;
  error: string | null;
};

/**
 * Source de vérité : la base Supabase.
 * - chargement initial
 * - mutations (créer / modifier / supprimer)
 * - synchronisation temps réel via Supabase Realtime (ou événements locaux)
 */
export function usePurchases(enabled = true) {
  const [state, setState] = useState<DataState>({
    housemates: [],
    purchases: [],
    loading: enabled,
    error: null,
  });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [housemates, purchases] = await Promise.all([
        dataService.listHousemates(),
        dataService.listPurchases(),
      ]);
      if (!mounted.current) return;
      setState({ housemates, purchases, loading: false, error: null });
    } catch (error) {
      if (!mounted.current) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Une erreur est survenue.",
      }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState({ housemates: [], purchases: [], loading: false, error: null });
      return;
    }
    void refresh();
    const unsubscribe = dataService.subscribeToChanges(() => {
      void refresh();
    });
    return unsubscribe;
  }, [refresh, enabled]);

  const createPurchase = useCallback(
    async (input: PurchaseInput) => {
      const created = await dataService.createPurchase(input);
      await refresh();
      return created;
    },
    [refresh],
  );

  const updatePurchase = useCallback(
    async (id: string, input: PurchaseInput) => {
      await dataService.updatePurchase(id, input);
      await refresh();
    },
    [refresh],
  );

  const deletePurchase = useCallback(
    async (id: string) => {
      await dataService.deletePurchase(id);
      await refresh();
    },
    [refresh],
  );

  const setPurchasePhoto = useCallback(
    async (id: string, photoPath: string | null) => {
      await dataService.setPurchasePhoto(id, photoPath);
      await refresh();
    },
    [refresh],
  );

  return {
    housemates: state.housemates,
    purchases: state.purchases,
    loading: state.loading,
    error: state.error,
    refresh,
    createPurchase,
    updatePurchase,
    deletePurchase,
    setPurchasePhoto,
  };
}
