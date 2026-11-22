"use client";

import { Logo } from "@/components/logo";
import { useTelegramWebApp } from "@/components/telegram-web-app";
import Link from "next/link";
import { useState } from "react";

type SessionResponse = {
  ok: boolean;
  data?: { email: string; fullName: string; telegramId: number };
  error?: string;
  details?: string[];
};

export default function MiniAppPage() {
  const { webApp, status } = useTelegramWebApp();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function exchange() {
    if (!webApp?.initData) return;
    setLoading(true);
    try {
      const response = await fetch("/api/telegram/mini-app/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: webApp.initData }),
      });
      setSession((await response.json()) as SessionResponse);
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
                {telegramUser?.first_name
                  ? `Bonjour ${telegramUser.first_name} 👋`
                  : "Bonjour 👋"}
              </p>

              {session?.ok ? (
                <div className="space-y-3">
                  <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
                    Compte lié : {session.data?.email}
                  </p>
                  <Link
                    href="/dashboard"
                    className="block rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-primary/90"
                  >
                    Ouvrir le tableau de bord
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {session && !session.ok ? (
                    <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                      <p>{session.error}</p>
                      {session.details?.[0] ? <p className="mt-1 text-xs">{session.details[0]}</p> : null}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={exchange}
                    disabled={loading}
                    className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                  >
                    {loading ? "Vérification…" : "Me connecter"}
                  </button>
                </div>
              )}
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
