import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditClearPreview, AuditLog, AuditQuery } from "@/types";
import { dataService } from "@/services/dataService";

type AuditState = {
  items: AuditLog[];
  total: number;
  loading: boolean;
  error: string | null;
};

const DEFAULT_QUERY: AuditQuery = {
  search: "",
  action: "all",
  actor: "all",
  month: "all",
  page: 1,
  pageSize: 12,
};

/**
 * Journal d'audit : chargement paginé + filtres,
 * et mise à jour automatique dès qu'un événement est enregistré.
 */
export function useAuditLogs(enabled = true) {
  const [query, setQuery] = useState<AuditQuery>(DEFAULT_QUERY);
  const [state, setState] = useState<AuditState>({
    items: [],
    total: 0,
    loading: enabled,
    error: null,
  });

  const mounted = useRef(true);
  const requestSequence = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const request = ++requestSequence.current;
    try {
      const page = await dataService.listAuditLogs(query);
      if (!mounted.current || request !== requestSequence.current) return;
      setState({ ...page, loading: false, error: null });
    } catch (error) {
      if (!mounted.current || request !== requestSequence.current) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Une erreur est survenue.",
      }));
    }
  }, [query, enabled]);

  useEffect(() => {
    void refresh();
    if (!enabled) return;
    const unsubscribe = dataService.subscribeToAuditChanges(() => {
      void refresh();
    });
    return () => { requestSequence.current += 1; unsubscribe(); };
  }, [refresh, enabled]);

  const updateQuery = useCallback(
    (patch: Partial<AuditQuery>) => {
      setQuery((current) => ({ ...current, ...patch, page: 1 }));
    },
    [],
  );

  const goToPage = useCallback((page: number) => {
    setQuery((current) => ({ ...current, page: Math.max(1, page) }));
  }, []);

  const resetQuery = useCallback(() => setQuery({ ...DEFAULT_QUERY }), []);

  const clearHistory = useCallback(async (preview: AuditClearPreview, confirmation: string) => {
    const count = await dataService.clearAuditHistory(preview, confirmation);
    if (mounted.current) {
      requestSequence.current += 1;
      setState({ items: [], total: 0, loading: true, error: null });
      setQuery({ ...DEFAULT_QUERY });
    }
    return count;
  }, []);

  return {
    logs: state.items,
    total: state.total,
    loading: state.loading,
    error: state.error,
    query,
    updateQuery,
    goToPage,
    resetQuery,
    refresh,
    clearHistory,
  };
}
