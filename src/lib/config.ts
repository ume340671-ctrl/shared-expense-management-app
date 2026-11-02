/**
 * Configuration de l'application.
 *
 * Les variables VITE_* sont injectées au build par Vite.
 * Aucun secret administratif ne doit se trouver ici : seules la clé
 * publique (anon) et l'URL du projet Supabase sont utilisées côté frontend.
 */

const env = import.meta.env;

export const SUPABASE_URL: string = env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY ?? "";

/** true si Supabase est correctement configuré */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Compte unique partagé par les quatre colocataires */
export const SHARED_ACCOUNT_EMAIL = "admin-2026@gmail.com";

/** Les quatre colocataires prédéfinis */
export const HOUSEMATES = [
  "RACHID FERHAOUI",
  "ELHOUSSAINE OUMLAL",
  "TARIK MERRAS",
  "ABDESAMAD HAMI",
] as const;
