"use client";

import { useState } from "react";

export function TelegramLinkButton() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/telegram/link-code", { method: "POST" });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        data?: { code: string; expiresAt: string };
      };
      if (!response.ok || !payload.ok || !payload.data) {
        setError(payload.error ?? "Impossible de générer le code.");
        return;
      }
      setCode(payload.data.code);
      setExpiresAt(new Date(payload.data.expiresAt).toLocaleTimeString("fr-FR"));
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-night">Telegram</h2>
      <p className="mt-1 text-xs text-muted">
        Générez un code à usage unique, puis envoyez <span className="font-medium">/lier CODE</span> au
        bot.
      </p>

      {code ? (
        <div className="mt-3 space-y-2">
          <p className="rounded-lg bg-primary-50 px-3 py-2 text-center text-2xl font-bold tracking-[0.3em] text-primary-700">
            {code}
          </p>
          <p className="text-xs text-muted">Valable 10 minutes (expire à {expiresAt}).</p>
          <button
            type="button"
            onClick={generate}
            className="text-xs text-primary-ink hover:underline"
          >
            Générer un nouveau code
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="mt-3 w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-night hover:bg-surface disabled:opacity-60"
        >
          {loading ? "Génération…" : "Générer un code de liaison"}
        </button>
      )}

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
