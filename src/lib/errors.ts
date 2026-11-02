/** Messages d'erreur compréhensibles, avec aide contextuelle */

export type DescribedError = {
  message: string;
  hint?: string;
};

/** Traduit une erreur technique en message clair pour l'utilisateur */
export function describeDataError(error: unknown): DescribedError {
  const raw = error instanceof Error ? error.message : String(error ?? "");

  // Tables absentes : migrations non exécutées
  if (/PGRST205|schema cache|does not exist|relation .* does not exist/i.test(raw)) {
    return {
      message: "La base de données n'est pas encore initialisée.",
      hint: "Exécutez le fichier supabase/migrations/20260101000000_initial_schema.sql dans le SQL Editor de Supabase, puis rechargez cette page.",
    };
  }

  // Accès refusé (RLS, session expirée, politique manquante)
  if (/JWT|jwt|permission denied|row-level security|row level security|42501|PGRST|401|403/i.test(raw)) {
    return {
      message: "L'accès aux données a été refusé par la base.",
      hint: "Vérifiez que vous êtes connecté au compte partagé et que les politiques de sécurité (RLS) ont bien été créées par la migration.",
    };
  }

  // Réseau
  if (/fetch|network|failed to fetch|timeout/i.test(raw)) {
    return {
      message: "Connexion au serveur impossible.",
      hint: "Vérifiez votre connexion internet, puis réessayez.",
    };
  }

  return { message: raw || "Une erreur inattendue est survenue." };
}
