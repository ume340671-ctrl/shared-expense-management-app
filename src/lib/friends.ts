import { formatMoney } from "./format";
import type {
  FriendBalance, FriendExpense, FriendSettlement, SuggestedSettlement,
} from "@/types/friends";

export const FRIENDS_MIGRATION = "supabase/migrations/20260601000000_friends_expenses.sql";
export const MAX_FRIEND_AMOUNT_CENTS = 100_000_000;

export const formatCents = (cents: number): string => formatMoney(cents / 100);

/** Parse decimal text without multiplying a floating point number. */
export function parseCents(value: string): number | null {
  const text = value.trim().replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fractional = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fractional.padEnd(2, "0"));
  return cents > 0 && cents <= MAX_FRIEND_AMOUNT_CENTS ? cents : null;
}

export function centsInput(cents: number): string {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** Same deterministic remainder allocation as the PostgreSQL function. */
export function splitEqualCents(amount: number, memberIds: string[]): Map<string, number> {
  const ids = [...new Set(memberIds)].sort();
  if (!Number.isSafeInteger(amount) || amount < 1 || ids.length === 0 || ids.length > 50) {
    throw new Error("Montant ou participants invalides.");
  }
  const base = Math.floor(amount / ids.length);
  const remainder = amount % ids.length;
  return new Map(ids.map((id, index) => [id, base + (index < remainder ? 1 : 0)]));
}

/** Used for tests and previews; displayed balances come from PostgreSQL. */
export function computeFriendBalances(
  memberIds: string[], expenses: FriendExpense[], settlements: FriendSettlement[],
): FriendBalance[] {
  const result = new Map(memberIds.map((id) => [id, { member_id: id, balance_cents: 0, paid_cents: 0 }]));
  for (const expense of expenses) {
    const payer = result.get(expense.payer_id);
    if (!payer) throw new Error("Payeur introuvable.");
    payer.balance_cents += expense.amount_cents;
    payer.paid_cents += expense.amount_cents;
    for (const [id, share] of splitEqualCents(expense.amount_cents, expense.participant_ids)) {
      const member = result.get(id);
      if (!member) throw new Error("Participant introuvable.");
      member.balance_cents -= share;
    }
  }
  for (const settlement of settlements) {
    const from = result.get(settlement.from_member_id);
    const to = result.get(settlement.to_member_id);
    if (!from || !to) throw new Error("Participant introuvable.");
    from.balance_cents += settlement.amount_cents;
    to.balance_cents -= settlement.amount_cents;
  }
  return [...result.values()];
}

/** Netting suggestions, never recorded until the user confirms an actual payment. */
export function suggestSettlements(balances: FriendBalance[]): SuggestedSettlement[] {
  const debtors = balances.filter((b) => b.balance_cents < 0)
    .map((b) => ({ id: b.member_id, remaining: -b.balance_cents }));
  const creditors = balances.filter((b) => b.balance_cents > 0)
    .map((b) => ({ id: b.member_id, remaining: b.balance_cents }));
  const suggestions: SuggestedSettlement[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const from = debtors[debtorIndex];
    const to = creditors[creditorIndex];
    const amount = Math.min(from.remaining, to.remaining);
    suggestions.push({ from_member_id: from.id, to_member_id: to.id, amount_cents: amount });
    from.remaining -= amount;
    to.remaining -= amount;
    if (from.remaining === 0) debtorIndex += 1;
    if (to.remaining === 0) creditorIndex += 1;
  }
  return suggestions;
}

export function friendsError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const messages: Record<string, string> = {
    FRIENDS_FORBIDDEN: "Accès réservé au compte partagé. Veuillez vous reconnecter.",
    FRIENDS_PERIOD_CLOSED: "Cette période a déjà été clôturée. Revenez à la période actuelle.",
    FRIENDS_PERIOD_NOT_FOUND: "Cette période n'est plus disponible. Actualisez les données.",
    FRIENDS_OUTSTANDING_DEBT: "Réinitialisation impossible : des remboursements restent à effectuer.",
    FRIENDS_EMPTY_PERIOD: "La période est déjà vide. Aucune réinitialisation n'est nécessaire.",
    FRIENDS_STALE_RECORD: "Ces données ont changé sur un autre appareil. Actualisez avant de réessayer.",
    FRIENDS_INVALID_SETTLEMENT: "Ce remboursement dépasse les soldes actuels ou ne relie pas un débiteur à un créancier. Actualisez les soldes.",
    FRIENDS_INVALID_AMOUNT: "Saisissez un montant positif, avec au maximum deux décimales (1 000 000 DH maximum).",
    FRIENDS_INVALID_PARTICIPANTS: "Sélectionnez entre 1 et 50 participants valides, sans doublon.",
    FRIENDS_INVALID_DATE: "Choisissez une date valide qui ne dépasse pas aujourd'hui.",
    FRIENDS_INVALID_NAME: "Le nom est obligatoire (80 caractères maximum).",
    FRIENDS_INVALID_DESCRIPTION: "La description est obligatoire (200 caractères maximum).",
    FRIENDS_INVALID_NOTES: "La remarque ne peut pas dépasser 1 000 caractères.",
  };
  for (const [code, message] of Object.entries(messages)) if (raw.includes(code)) return message;
  if (/23505|duplicate key|friend_members_name/i.test(raw)) return "Ce participant existe déjà.";
  if (/PGRST202|PGRST205|schema cache|does not exist/i.test(raw)) {
    return `Le module n'est pas encore initialisé. Exécutez ${FRIENDS_MIGRATION} dans le SQL Editor de Supabase.`;
  }
  if (/JWT|42501|permission denied|\b401\b|\b403\b/i.test(raw)) return "Votre session ne permet pas cette opération. Reconnectez-vous au compte partagé.";
  if (/fetch|network|timeout/i.test(raw)) return "Connexion impossible. Vos saisies sont conservées ; vérifiez votre réseau puis réessayez.";
  return raw || "L'opération a échoué. Veuillez réessayer.";
}