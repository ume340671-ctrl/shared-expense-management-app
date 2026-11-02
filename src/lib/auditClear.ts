export const AUDIT_CLEAR_CONFIRMATION = "SUPPRIMER";
export const AUDIT_CLEAR_MIGRATION = "supabase/migrations/20260701000000_audit_history_cleanup.sql";

export function auditClearError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/AUDIT_CLEAR_FORBIDDEN|42501|permission denied|JWT/i.test(message)) {
    return "Cette opération est réservée au compte partagé autorisé. Veuillez vous reconnecter.";
  }
  if (message.includes("AUDIT_CLEAR_CONFIRMATION")) return "Saisissez SUPPRIMER pour confirmer la suppression de l'historique.";
  if (/AUDIT_CLEAR_EXPIRED|AUDIT_CLEAR_INVALID_REQUEST/.test(message)) {
    return "Cette confirmation n'est plus valide. Fermez cette fenêtre, puis recommencez.";
  }
  if (/PGRST202|PGRST205|schema cache|does not exist/i.test(message)) {
    return `La suppression sécurisée n'est pas encore activée. Exécutez ${AUDIT_CLEAR_MIGRATION} dans le SQL Editor de Supabase.`;
  }
  if (/fetch|network|timeout/i.test(message)) {
    return "La suppression n'a pas pu être confirmée. Vérifiez votre connexion et réessayez ; les nouveaux événements ne seront pas supprimés par un réenvoi de la même demande.";
  }
  return message || "Impossible de supprimer l'historique. Veuillez réessayer.";
}