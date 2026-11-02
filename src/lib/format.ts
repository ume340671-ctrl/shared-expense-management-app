/** Formatage des montants et des dates — locale fr (DH) */

const moneyFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("fr-FR");

const longDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
});

const monthYearFormatter = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});

const weekdayFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** Arrondi à 2 décimales, protégé contre les erreurs flottantes */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Montant en dirhams. Les décimales ne sont affichées que si nécessaires.
 * Exemples : 18 -> "18 DH", 18.5 -> "18,5 DH", 1234.56 -> "1 234,56 DH"
 */
export function formatMoney(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${moneyFormatter.format(roundMoney(safe))} DH`;
}

/** Montant compact pour les grandes valeurs (ex. "12,4k DH") */
export function formatMoneyCompact(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  if (Math.abs(safe) >= 1_000_000) return `${moneyFormatter.format(roundMoney(safe / 1_000_000))}M DH`;
  if (Math.abs(safe) >= 10_000) return `${moneyFormatter.format(roundMoney(safe / 1000))}k DH`;
  return formatMoney(safe);
}

/** Nombre simple (compteurs) */
export function formatNumber(value: number): string {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

/** Pourcentage, une décimale max */
export function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(safe)} %`;
}

/** Parse une date ISO (YYYY-MM-DD) en date locale (évite les décalages UTC) */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Date locale au format YYYY-MM-DD */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Mois courant au format YYYY-MM */
export function currentMonthKey(date: Date = new Date()): string {
  return toISODate(date).slice(0, 7);
}

export function formatLongDate(iso: string): string {
  return longDateFormatter.format(parseLocalDate(iso));
}

export function formatShortDate(iso: string): string {
  return shortDateFormatter.format(parseLocalDate(iso));
}

export function formatWeekdayDate(iso: string): string {
  return weekdayFormatter.format(parseLocalDate(iso));
}

/** "Mars 2026" à partir de "2026-03" */
export function formatMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return monthYearFormatter.format(new Date(y, m - 1, 1));
}

/** Initiales pour les avatars : "RACHID FERHAOUI" -> "RF" */
export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
