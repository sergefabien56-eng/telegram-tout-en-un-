"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

type Props = {
  shopId: string;
  linked: boolean;
};

/**
 * Lance la synchronisation du catalogue et/ou des stocks Jumia,
 * puis recharge les données serveur.
 */
export function CatalogSyncButton({ shopId, linked }: Props) {
  const [kind, setKind] = useState<"products" | "stocks" | "all">("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/shops/${shopId}/produits/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: {
          products?: number;
          productInserted?: number;
          productUpdated?: number;
          stockMatched?: number;
          stockMissing?: number;
          truncated?: boolean;
        };
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Synchronisation impossible.");
        return;
      }
      const data = payload.data;
      const parts: string[] = [];
      if ((data?.products ?? 0) > 0 || kind !== "stocks") {
        parts.push(
          `${data?.products ?? 0} produit(s) · ${data?.productInserted ?? 0} nouveau(x) · ${
            data?.productUpdated ?? 0
          } mis à jour`,
        );
      }
      if (kind !== "products") {
        parts.push(`${data?.stockMatched ?? 0} stock(s) mis à jour`);
        if ((data?.stockMissing ?? 0) > 0) {
          parts.push(`${data?.stockMissing} SKU sans déclinaison locale`);
        }
      }
      setMessage(
        `${parts.join(" · ")}${
          data?.truncated ? " · limite de pages atteinte (5 × 100), relancez pour compléter" : ""
        }.`,
      );
    } catch {
      setError("Erreur réseau pendant la synchronisation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="catalog-sync-kind" className="sr-only">
        Contenu à synchroniser
      </label>
      <select
        id="catalog-sync-kind"
        value={kind}
        onChange={(event) => setKind(event.target.value as typeof kind)}
        className="focusable rounded-lg border border-border bg-surface px-3 py-2 text-sm text-night"
      >
        <option value="all">Catalogue + stocks</option>
        <option value="products">Catalogue seulement</option>
        <option value="stocks">Stocks seulement</option>
      </select>

      <button
        type="button"
        onClick={run}
        disabled={busy || !linked}
        title={linked ? undefined : "Rattachez d'abord la boutique à une boutique Jumia"}
        className="focusable inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
        {busy ? "Synchronisation…" : "Synchroniser le catalogue"}
      </button>

      {!linked ? (
        <span className="text-xs text-muted">
          Rattachez la boutique à une boutique Jumia pour activer la synchronisation.
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
