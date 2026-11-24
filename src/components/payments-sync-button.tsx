"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

type Props = { shopId: string; linked: boolean };

/** Relit les relevés de versement Jumia, puis recharge la page. */
export function PaymentsSyncButton({ shopId, linked }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/shops/${shopId}/paiements/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: { fetched?: number; inserted?: number; updated?: number };
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Synchronisation impossible.");
        return;
      }
      setMessage(
        `${payload.data?.fetched ?? 0} relevé(s) lu(s) · ${payload.data?.inserted ?? 0} nouveau(x) · ${
          payload.data?.updated ?? 0
        } mis à jour.`,
      );
      window.location.reload();
    } catch {
      setError("Erreur réseau pendant la synchronisation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={busy || !linked}
        title={linked ? undefined : "Rattachez d'abord la boutique à une boutique Jumia"}
        className="focusable inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
        {busy ? "Synchronisation…" : "Synchroniser les paiements"}
      </button>
      {!linked ? (
        <span className="text-xs text-muted">
          Rattachez la boutique à une boutique Jumia pour activer les relevés.
        </span>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-success">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
