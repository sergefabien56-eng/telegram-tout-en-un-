"use client";

import { Logo } from "@/components/logo";
import { TelegramThemeSync } from "@/components/telegram-theme-sync";
import { useTelegramWebApp } from "@/components/telegram-web-app";
import Link from "next/link";
import { useEffect, useState } from "react";

type SessionResponse = {
  ok: boolean;
  data?: { email: string; fullName: string; telegramId: number };
  error?: string;
  details?: string[];
};

/** Pages de la Mini App atteignables par lien direct (`?page=`). */
const MINI_APP_PAGES = new Set([
  "mimi",
  "dashboard",
  "commandes",
  "produits",
  "stocks",
  "finances",
  "rapports",
]);

function targetFromQuery(): string {
  const page = new URLSearchParams(window.location.search).get("page");
  return page && MINI_APP_PAGES.has(page) ? `/${page}` : "/dashboard";
}

export default function MiniAppPage() {
  return (
    <TelegramThemeSync>
      <MiniAppContent />
    </TelegramThemeSync>
  );
}

function MiniAppContent() {
  const { webApp, status } = useTelegramWebApp();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Déjà lié (cookie de session) : on entre directement dans l'app.
  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { ok: boolean; data?: { email: string } };
        if (payload.ok && payload.data?.email) {
          window.location.replace(targetFromQuery());
        }
      })
      .catch(() => undefined);
  }, []);

  async function exchange() {
    if (!webApp?.initData) return;
    setLoading(true);
    try {
      const response = await fetch("/api/telegram/mini-app/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData }),
      });
      const payload = (await response.json()) as SessionResponse;
      setSession(payload);
      if (payload.ok) window.location.replace(targetFromQuery());
    } catch {
      setSession({ ok: false, error: "Erreur réseau." });
    } finally {
      setLoading(false);
    }
  }

  const telegramUser = webApp?.initDataUnsafe?.user;

  return (
    <main className="min-h-screen bg-surface px-4 py-6">
      <div className="mx-auto max-w-md">
        <div className="flex items-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="text-sm font-semibold text-night">TOUT EN UN</span>
        </div>

        <section className="card mt-5 p-5">
          <h1 className="text-lg font-semibold text-night">Mini App Telegram</h1>

          {status === "loading" ? (
            <p className="mt-3 text-sm text-muted">Chargement de Telegram…</p>
          ) : status === "unavailable" ? (
            <div className="mt-3 space-y-2 text-sm text-muted">
              <p>⚠️ Cette page doit être ouverte dans Telegram.</p>
              <p>
                Ouvrez le lien depuis le bouton de menu du bot, ou{" "}
                <code className="rounded bg-surface px-1">t.me/votre_bot</code>.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-muted">
                {telegramUser?.first_name ? `Bonjour ${telegramUser.first_name} 👋` : "Bonjour 👋"}
              </p>

              {session && !session.ok ? (
                <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                  <p>{session.error}</p>
                  {session.details?.[0] ? (
                    <p className="mt-1 text-xs">{session.details[0]}</p>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                onClick={exchange}
                disabled={loading}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
              >
                {loading ? "Vérification…" : "Me connecter"}
              </button>

              <Link
                href="/version-web?redirect=/login"
                className="block rounded-lg border border-border px-4 py-2.5 text-center text-sm font-medium text-night hover:bg-surface"
              >
                Utiliser un autre compte (web)
              </Link>
            </div>
          )}
        </section>

        <p className="mt-4 text-center text-xs text-muted">
          Vos données restent sur le même compte que la version web.
        </p>
      </div>
    </main>
  );
}
