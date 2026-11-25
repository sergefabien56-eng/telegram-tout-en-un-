"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ShieldCheck } from "lucide-react";

type Props = {
  shopId: string;
  shopName: string;
};

/**
 * Actions correctives du diagnostic : resynchronisation complète d'une
 * boutique (avec sauvegarde préalable côté serveur) et re-test du compte
 * vendeur. Chaque action est journalisée.
 */
export function DiagnosticActions({ shopId, shopName }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resync() {
    if (!window.confirm(`Resynchroniser « ${shopName} » ? Une sauvegarde est produite avant.`)) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, action: "resync" }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: { ok: boolean; backup?: string | null; result?: unknown };
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Réparation impossible.");
        return;
      }
      const backup = payload.data?.backup;
      setMessage(
        `Synchronisation relancée${backup ? ` · sauvegarde « ${backup} » créée avant l'écriture` : ""}.`,
      );
      router.refresh();
    } catch {
      setError("Erreur réseau pendant la réparation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={resync}
        disabled={busy}
        className="focusable inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-night hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
        {busy ? "Synchronisation…" : "Resynchroniser"}
      </button>
      {message ? (
        <p role="status" className="max-w-xs text-right text-xs text-success">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="max-w-xs text-right text-xs text-danger">
          {error}
        </p>
      ) : null}
      <p className="flex items-center gap-1 text-right text-[11px] text-muted">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        Sauvegarde automatique avant écriture.
      </p>
    </div>
  );
}
