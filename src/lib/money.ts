/**
 * Utilitaires financiers — R3.
 * Les montants sont des entiers en unités mineures, toujours avec leur devise.
 * Le franc CFA (XOF) n'a pas de décime : unité mineure = 0.
 */

export const MINOR_UNITS: Record<string, 0 | 2> = {
  XOF: 0,
  EUR: 2,
  USD: 2,
  GNF: 0,
  XAF: 0,
};

export function minorUnits(currency: string): 0 | 2 {
  return MINOR_UNITS[currency.toUpperCase()] ?? 2;
}

/**
 * Formate un montant entier (unité mineure) pour l'affichage.
 * Ex. formatMoney(123456, "XOF") -> "123 456 FCFA"
 */
export function formatMoney(amountMinor: number, currency: string, locale = "fr-FR"): string {
  if (!Number.isFinite(amountMinor)) return "—";
  const upper = currency.toUpperCase();
  const fractionDigits = minorUnits(upper);
  // Les francs africains s'affichent avec leur libellé usuel (FCFA / GNF).
  const suffix = upper === "XOF" || upper === "XAF" ? "FCFA" : upper === "GNF" ? "GNF" : null;
  if (suffix) {
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amountMinor);
    return `${number} ${suffix}`;
  }
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: upper,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amountMinor / 10 ** fractionDigits);
  } catch {
    return `${amountMinor.toLocaleString(locale)} ${upper}`;
  }
}

/**
 * Convertit une saisie utilisateur en unité mineure (entier).
 * Retourne null si la saisie est invalide.
 */
export function parseMoneyToMinor(input: string, currency: string): number | null {
  const normalized = input.trim().replace(/[\s ]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const fractionDigits = minorUnits(currency);
  const factor = 10 ** fractionDigits;
  const value = Math.round(Number(normalized) * factor);
  return Number.isSafeInteger(value) ? value : null;
}

/** Additionne des montants de la MÊME devise. Refuse les devises multiples. */
export function addMoney(amounts: readonly { amountMinor: number; currency: string }[]): {
  amountMinor: number;
  currency: string;
} {
  const first = amounts[0];
  if (!first) throw new Error("addMoney : liste vide");
  const currency = first.currency;
  let total = 0;
  for (const a of amounts) {
    if (a.currency !== currency) {
      throw new Error(`addMoney : devises différentes (${currency} vs ${a.currency})`);
    }
    total += a.amountMinor;
  }
  return { amountMinor: total, currency };
}
