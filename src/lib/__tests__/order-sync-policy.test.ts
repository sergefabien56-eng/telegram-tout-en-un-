import { describe, expect, it } from "vitest";
import {
  LARGE_SYNC_WINDOW_DAYS,
  MAX_SYNC_WINDOW_DAYS,
  ORDERS_MAX_PAGES,
  ORDERS_PAGE_SIZE,
  validateSyncWindow,
} from "@/lib/order-sync-policy";

/**
 * Politique de synchronisation — les refus doivent être identiques dans
 * l'interface et dans l'API.
 */
describe("fenêtre de synchronisation", () => {
  const jour = (value: string) => new Date(`${value}T00:00:00.000Z`);

  it("refuse une période incomplète", () => {
    const resultat = validateSyncWindow(jour("2026-11-01"), null);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.reason).toContain("Période incomplète");
  });

  it("refuse une période inversée", () => {
    const resultat = validateSyncWindow(jour("2026-11-20"), jour("2026-11-01"));
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.reason).toContain("inversée");
  });

  it("refuse une période plus large que la limite de l'API Jumia", () => {
    const debut = jour("2026-01-01");
    const fin = new Date(debut.getTime() + (MAX_SYNC_WINDOW_DAYS + 5) * 86_400_000);
    const resultat = validateSyncWindow(debut, fin);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.reason).toContain(`${MAX_SYNC_WINDOW_DAYS} jours`);
  });

  it("accepte une période valide et calcule sa durée", () => {
    const resultat = validateSyncWindow(jour("2026-11-01"), jour("2026-11-10"));
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.spanDays).toBe(9);
      expect(resultat.large).toBe(false);
    }
  });

  it("signale une opération volumineuse au-delà du seuil de confirmation", () => {
    const debut = jour("2026-09-01");
    const fin = jour("2026-10-15");
    const resultat = validateSyncWindow(debut, fin);
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.spanDays).toBeGreaterThan(LARGE_SYNC_WINDOW_DAYS);
      expect(resultat.large).toBe(true);
    }
  });

  it("accepte exactement la limite maximale", () => {
    const debut = jour("2026-08-01");
    const fin = new Date(debut.getTime() + MAX_SYNC_WINDOW_DAYS * 86_400_000);
    const resultat = validateSyncWindow(debut, fin);
    expect(resultat.ok).toBe(true);
  });
});

describe("paramètres de lecture de l'API", () => {
  it("respecte la pagination documentée", () => {
    expect(ORDERS_PAGE_SIZE).toBe(200);
    expect(ORDERS_MAX_PAGES).toBe(5);
  });
});
