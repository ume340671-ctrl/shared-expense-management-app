import { useEffect, useMemo, useState } from "react";
import type { PurchaseWithBuyer } from "@/types";
import { resolvePhotoUrls } from "@/lib/photoStorage";

/**
 * Résout les chemins de photos en URL affichables (URL signées Supabase,
 * ou blob locales en mode secours) et les rafraîchit quand les achats changent.
 */
export function usePhotoUrls(purchases: PurchaseWithBuyer[]): Record<string, string> {
  const paths = useMemo(
    () =>
      purchases
        .map((purchase) => purchase.photo_path)
        .filter((path): path is string => Boolean(path)),
    [purchases],
  );
  const cacheKey = paths.join("|");

  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    if (paths.length === 0) {
      setUrls({});
      return;
    }

    resolvePhotoUrls(paths).then((resolved) => {
      if (!active) return;
      setUrls((previous) => {
        // Libération des blob: locales obsolètes (mode secours)
        Object.values(previous).forEach((url) => {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        });
        return resolved;
      });
    });

    return () => {
      active = false;
    };
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return urls;
}
