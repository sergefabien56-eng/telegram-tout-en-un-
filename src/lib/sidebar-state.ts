/**
 * État de la barre latérale — `open` (pleine largeur) ou `rail` (icônes seules).
 *
 * Le choix est posé dans `localStorage` puis reflété sur `<html data-sidebar>`,
 * afin que le premier rendu soit déjà correct (pas de « flash »). Aucune donnée
 * personnelle : c'est un simple réglage d'affichage.
 */

export const SIDEBAR_STORAGE_KEY = "teu_sidebar";

export const SIDEBAR_STATES = ["open", "rail"] as const;
export type SidebarState = (typeof SIDEBAR_STATES)[number];

export function isSidebarState(value: string | null | undefined): value is SidebarState {
  return value === "rail" || value === "open";
}

/** Lit l'état courant ; `open` par défaut (valeur sûre si le stockage échoue). */
export function readSidebarState(): SidebarState {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return isSidebarState(stored) ? stored : "open";
  } catch {
    return "open";
  }
}

/** Applique l'état et le mémorise. Le CSS pilote la largeur immédiatement. */
export function applySidebarState(state: SidebarState): void {
  document.documentElement.dataset.sidebar = state;
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, state);
  } catch {
    // mode privé : le réglage reste valable pour l'onglet courant
  }
}
