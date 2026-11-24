"use client";

import { useEffect } from "react";

/**
 * Thème Telegram (spec 4.4) : les `themeParams` fusionnent avec nos jetons.
 *
 * On ne remplace que les couleurs de surface et le texte ; `primary` reste
 * notre bleu tant que Telegram n'en fournit pas de cohérent.
 */

export type TelegramThemeParams = {
  bg_color?: string;
  secondary_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  header_bg_color?: string;
};

function toRgbTriplet(hex: string): string | null {
  const value = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

type TelegramGlobal = {
  WebApp?: { themeParams: TelegramThemeParams; colorScheme: "light" | "dark" };
};

function setVariable(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

export function applyTelegramTheme(params: TelegramThemeParams, scheme: "light" | "dark") {
  const root = document.documentElement;

  // Le schéma Telegram pilote la classe `.dark` de notre thème.
  root.classList.toggle("dark", scheme === "dark");

  const surface = params.bg_color ? toRgbTriplet(params.bg_color) : null;
  const card = params.secondary_bg_color ? toRgbTriplet(params.secondary_bg_color) : null;
  const ink = params.text_color ? toRgbTriplet(params.text_color) : null;
  const muted = params.hint_color ? toRgbTriplet(params.hint_color) : null;
  const primary =
    params.link_color ?? (params.button_color ? toRgbTriplet(params.button_color) : null);

  if (surface) {
    setVariable("--surface", surface);
    setVariable("--card", card ?? surface);
  }
  if (ink) setVariable("--ink", ink);
  if (muted) setVariable("--muted", muted);
  if (primary) setVariable("--primary", primary);
  if (scheme === "dark") {
    setVariable("--night", ink ?? "226 232 245");
  }
}

/** Observe les changements de thème Telegram (`themeChanged`). */
export function useTelegramTheme(
  webApp: {
    themeParams: TelegramThemeParams;
    colorScheme: "light" | "dark";
    onEvent?: (event: string, cb: () => void) => void;
  } | null,
) {
  useEffect(() => {
    if (!webApp) return;
    applyTelegramTheme(webApp.themeParams ?? {}, webApp.colorScheme ?? "light");

    const handler = () => {
      const app = (window as Window & { Telegram?: TelegramGlobal }).Telegram?.WebApp;
      if (app) applyTelegramTheme(app.themeParams ?? {}, app.colorScheme ?? "light");
    };
    webApp.onEvent?.("themeChanged", handler);
    window.addEventListener("teu-theme-changed", handler);
    return () => window.removeEventListener("teu-theme-changed", handler);
  }, [webApp]);
}
