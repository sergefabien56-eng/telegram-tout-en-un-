"use client";

import type { ReactNode } from "react";
import { useTelegramTheme } from "@/components/telegram-theme";
import { useTelegramWebApp } from "@/components/telegram-web-app";

/**
 * Applique le thème Telegram (couleurs + schéma clair/sombre) à la coquille
 * Mini App dès le premier rendu côté client.
 */
export function TelegramThemeSync({ children }: { children: ReactNode }) {
  const { webApp } = useTelegramWebApp();
  useTelegramTheme(webApp);
  return <>{children}</>;
}
