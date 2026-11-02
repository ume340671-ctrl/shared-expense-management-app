import { SHARED_ACCOUNT_EMAIL, isSupabaseConfigured } from "@/lib/config";
import { getSupabase } from "@/lib/supabase";

/**
 * Authentification — compte unique partagé.
 *
 * En production : Supabase Auth (le compte admin-2026@gmail.com est créé
 * une seule fois dans le dashboard Supabase, aucun mot de passe n'est stocké
 * côté frontend).
 *
 * En mode local de secours (variables Supabase absentes) : le mot de passe
 * est défini au premier lancement puis conservé uniquement sous forme de
 * condensat SHA-256 salé — jamais en clair.
 */

const LOCAL_CREDENTIALS_KEY = "t9dya.local-credentials.v1";
const LOCAL_SESSION_KEY = "t9dya.local-session.v1";
const AUTH_CHANGE_EVENT = "t9dya:auth-change";

export type AuthResult = { ok: true } | { ok: false; error: string };

async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ------------------------------ Mode local ------------------------------ */

/** Notifie l'application d'un changement de session (même onglet) */
function notifyAuthChange(): void {
  window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
}

function readLocalCredentials(): { email: string; salt: string; hash: string } | null {
  try {
    const raw = localStorage.getItem(LOCAL_CREDENTIALS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** true si le mode local n'a pas encore de mot de passe défini */
export function needsLocalSetup(): boolean {
  return !isSupabaseConfigured && readLocalCredentials() === null;
}

/** Définit le mot de passe initial (mode local, hashé SHA-256 salé) */
export async function setupLocalPassword(password: string): Promise<AuthResult> {
  if (password.length < 8) {
    return { ok: false, error: "Le mot de passe doit contenir au moins 8 caractères." };
  }
  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  localStorage.setItem(
    LOCAL_CREDENTIALS_KEY,
    JSON.stringify({ email: SHARED_ACCOUNT_EMAIL, salt, hash }),
  );
  return { ok: true };
}

async function signInLocal(email: string, password: string): Promise<AuthResult> {
  const credentials = readLocalCredentials();
  if (!credentials) {
    return { ok: false, error: "Aucun mot de passe n'a encore été défini pour ce compte." };
  }
  if (email.trim().toLowerCase() !== credentials.email.toLowerCase()) {
    return { ok: false, error: "Adresse e-mail ou mot de passe incorrect." };
  }
  const hash = await hashPassword(password, credentials.salt);
  if (hash !== credentials.hash) {
    return { ok: false, error: "Adresse e-mail ou mot de passe incorrect." };
  }
  localStorage.setItem(LOCAL_SESSION_KEY, credentials.email);
  notifyAuthChange();
  return { ok: true };
}

/* --------------------------- API unifiée --------------------------- */

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, error: "Client Supabase indisponible." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: "Adresse e-mail ou mot de passe incorrect." };
    return { ok: true };
  }
  return signInLocal(email, password);
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    return;
  }
  localStorage.removeItem(LOCAL_SESSION_KEY);
  notifyAuthChange();
}

export async function getSessionEmail(): Promise<string | null> {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.email ?? null;
  }
  return localStorage.getItem(LOCAL_SESSION_KEY);
}

/** Abonnement aux changements d'état de session */
export function onAuthStateChange(callback: (email: string | null) => void): () => void {
  if (isSupabaseConfigured) {
    const supabase = getSupabase();
    if (!supabase) return () => {};
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user?.email ?? null);
    });
    return () => data.subscription.unsubscribe();
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCAL_SESSION_KEY) callback(event.newValue);
  };
  const onAuthChange = () => callback(localStorage.getItem(LOCAL_SESSION_KEY));
  window.addEventListener("storage", onStorage);
  window.addEventListener(AUTH_CHANGE_EVENT, onAuthChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(AUTH_CHANGE_EVENT, onAuthChange);
  };
}
