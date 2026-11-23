"use client";

import { useEffect, useState } from "react";

type TelegramWebApp = {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; username?: string } };
  ready: () => void;
  expand: () => void;
  MainButton: { setText: (text: string) => void; show: () => void; hide: () => void };
  themeParams: Record<string, string>;
  colorScheme: "light" | "dark";
  onEvent: (event: string, callback: () => void) => void;
  /** Bouton retour natif Telegram (disponible dans les Mini Apps). */
  BackButton?: { show: () => void; hide: () => void; onClick: (cb: () => void) => void };
  back?: () => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const SCRIPT_URL = "https://telegram.org/js/telegram-web-app.js";

/** Charge le script officiel Telegram (Mini App uniquement). */
export function useTelegramWebApp() {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    if (window.Telegram?.WebApp?.initData) {
      setWebApp(window.Telegram.WebApp);
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      setStatus("ready");
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const app = window.Telegram?.WebApp ?? null;
      if (app?.initData) {
        setWebApp(app);
        app.ready();
        app.expand();
        setStatus("ready");
      } else {
        setStatus("unavailable");
      }
    };
    script.onerror = () => setStatus("unavailable");
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return { webApp, status };
}
