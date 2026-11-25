"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

type Props = {
  shopId: string;
  /** Boutique non rattachée : la synchronisation est impossible. */
  linked: boolean;
};

/**
 * Lance la synchronisation complète d'une boutique (catalogue + stocks,
 * commandes et relevés) puis rafraîchit l'écran.
 */
export function ShopFullSyncButton({ shopId, linked }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/shops/${shopId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 90 }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: {
          catalog?: { ok: boolean; fetched?: number; inserted?: number; reason?: string };
          orders?: { ok: boolean; fetched?: number; inserted?: number; reason?: string };
          payments?: { ok: boolean; fetched?: number; inserted?: number; reason?: string };
        };
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Synchronisation impossible.");
        return;
      }
      const data = payload.data;
      const describe = (label: string, step?: { ok: boolean; fetched?: number; reason?: string }) =>
        step?.ok
          ? `${label} : ${step.fetched ?? 0} lu(s)`
          : `${label} : échec${step?.reason ? ` (${step.reason})` : ""}`;
      setMessage(
        [
          describe("Catalogue", data?.catalog),
          describe("Commandes", data?.orders),
          describe("Relevés", data?.payments),
        ].join(" · "),
      );
      router.refresh();
    } catch {
      setError("Erreur réseau pendant la synchronisation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy || !linked}
        title={linked ? undefined : "Rattachez d'abord la boutique à une boutique Jumia"}
        className="focusable inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-night hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
        {busy ? "Synchronisation…" : "Tout synchroniser"}
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
    </div>
  );
}
