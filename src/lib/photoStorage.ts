import { getSupabase } from "./supabase";
import { isSupabaseConfigured } from "./config";

/**
 * Gestion des photos d'achats — Supabase Storage.
 *
 * Bucket privé « purchase-photos » : les images ne sont pas publiques,
 * l'accès se fait via des URL signées générées à la demande pour le
 * compte authentifié (les politiques Storage restreignent au compte partagé).
 *
 * En mode local de secours (Supabase non configuré), les images sont
 * conservées dans IndexedDB afin de garder le même comportement.
 */

export const PHOTO_BUCKET = "purchase-photos";
export const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 Mo
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
export const PHOTO_ACCEPT_ATTRIBUTE = "image/jpeg,image/png,image/webp";

/** Préfixe de chemin : chaque photo est rangée dans le dossier de son achat */
export function photoPathFor(purchaseId: string, fileName: string): string {
  const extension = fileName.includes(".")
    ? fileName.split(".").pop()!.toLowerCase()
    : "jpg";
  const safeExtension = ["jpg", "jpeg", "png", "webp"].includes(extension)
    ? extension
    : "jpg";
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `purchases/${purchaseId}/${unique}.${safeExtension}`;
}

/** Valide le type réel et la taille du fichier avant tout envoi */
export function validatePhotoFile(file: File): string | null {
  const hasAcceptedType =
    ACCEPTED_PHOTO_TYPES.includes(file.type) ||
    /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!hasAcceptedType) {
    return "Format non pris en charge. Utilisez une image JPG, JPEG, PNG ou WEBP.";
  }
  if (file.size > MAX_PHOTO_SIZE) {
    return "L'image est trop volumineuse (5 Mo maximum).";
  }
  if (file.size === 0) {
    return "Le fichier sélectionné est vide.";
  }
  return null;
}

/* ------------------------- Stockage local (secours) ------------------------- */

const DB_NAME = "t9dya-photos";
const STORE_NAME = "photos";

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* Repli en mémoire si IndexedDB est indisponible (navigation privée, tests) */
const memoryStore = new Map<string, Blob>();
let idbUsable: boolean | null = null;

async function isIdbUsable(): Promise<boolean> {
  if (idbUsable !== null) return idbUsable;
  try {
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB indisponible");
    const db = await openPhotoDb();
    db.close();
    idbUsable = true;
  } catch {
    idbUsable = false;
  }
  return idbUsable;
}

async function localPutBlob(path: string, blob: Blob): Promise<void> {
  if (!(await isIdbUsable())) {
    memoryStore.set(path, blob);
    return;
  }
  const db = await openPhotoDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(blob, path);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function localGetBlob(path: string): Promise<Blob | null> {
  if (!(await isIdbUsable())) {
    return memoryStore.get(path) ?? null;
  }
  const db = await openPhotoDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(path);
    request.onsuccess = () => resolve((request.result as Blob) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

async function localDeleteBlob(path: string): Promise<void> {
  memoryStore.delete(path);
  if (!(await isIdbUsable())) return;
  const db = await openPhotoDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(path);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

/* ------------------------------ API unifiée ------------------------------ */

function friendlyStorageError(error: { message: string }): Error {
  if (/bucket not found|bucket .* not exist/i.test(error.message)) {
    return new Error(
      "Le dossier de stockage des photos n'existe pas encore. Exécutez la migration supabase/migrations/20260401000000_purchase_photos.sql dans Supabase.",
    );
  }
  if (/exceeded the maximum allowed size|payload too large/i.test(error.message)) {
    return new Error("L'image dépasse la taille maximale autorisée (5 Mo).");
  }
  if (/mime type|not allowed/i.test(error.message)) {
    return new Error("Ce type de fichier n'est pas autorisé (JPG, PNG ou WEBP uniquement).");
  }
  return new Error(`L'opération sur la photo a échoué : ${error.message}`);
}

/** Envoie la photo et retourne son chemin de stockage */
export async function uploadPurchasePhoto(
  purchaseId: string,
  file: File,
): Promise<string> {
  const validationError = validatePhotoFile(file);
  if (validationError) throw new Error(validationError);

  const path = photoPathFor(purchaseId, file.name);

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Client Supabase indisponible.");
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw friendlyStorageError(error);
    return path;
  }

  await localPutBlob(path, file);
  return path;
}

/** Supprime définitivement une photo du stockage */
export async function deletePurchasePhoto(path: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    if (error) throw friendlyStorageError(error);
    return;
  }
  await localDeleteBlob(path);
}

/** URL d'affichage pour un chemin (URL signée valable 6 h en mode Supabase) */
export async function resolvePhotoUrl(path: string): Promise<string | null> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, 6 * 60 * 60);
    if (error || !data) return null;
    return data.signedUrl;
  }
  const blob = await localGetBlob(path);
  return blob ? URL.createObjectURL(blob) : null;
}

/** Résout plusieurs chemins en une seule fois (requête groupée) */
export async function resolvePhotoUrls(
  paths: string[],
): Promise<Record<string, string>> {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (uniquePaths.length === 0) return {};

  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (!supabase) return {};
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(uniquePaths, 6 * 60 * 60);
    if (error || !data) return {};
    const result: Record<string, string> = {};
    for (const entry of data) {
      if (entry.signedUrl) result[entry.path ?? ""] = entry.signedUrl;
    }
    return result;
  }

  const result: Record<string, string> = {};
  await Promise.all(
    uniquePaths.map(async (path) => {
      const blob = await localGetBlob(path);
      if (blob) result[path] = URL.createObjectURL(blob);
    }),
  );
  return result;
}
