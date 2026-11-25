"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

type SyncOption = { id: string; name: string; linked: boolean };

type Props = {
  shopId: string;
  /** Boutique non rattachée : la synchronisation est impossible. */
  linked: boolean;
  days?: number;
  /**
   * Boutiques cibles. Quand la liste en contient plusieurs, un sélecteur
   * permet de choisir LA boutique à synchroniser : on ne synchronise jamais
   * « la première » par défaut, cela confondait les boutiques.
   */
  options?: SyncOption[];
};

/** Lance une synchronisation des commandes puis recharge les données serveur. */
export function OrderSyncButton({ shopId, linked, days = 30, options }: Props) {
  const [targetId, setTargetId] = useState(shopId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // La cible effective : le sélecteur s'il y en a un, sinon la boutique reçue.
  const target = options?.find((option) => option.id === targetId) ?? options?.[0];
  const targetShopId = target?.id ?? shopId;
  const targetLinked = target ? target.linked : linked;

  async function run() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/shops/${targetShopId}/commandes/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: {
          orders: number;
          inserted: number;
          updated: number;
          pages: number;
          truncated: boolean;
        };
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Synchronisation impossible.");
        return;
      }
      const data = payload.data;
      setMessage(
        `${data?.orders ?? 0} commande(s) lue(s) · ${data?.inserted ?? 0} nouvelle(s) · ${
          data?.updated ?? 0
        } mise(s) à jour${
          data?.truncated ? " · limite de pages atteinte (5 × 200), relancez pour compléter" : ""
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
      {options && options.length > 1 ? (
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Boutique à synchroniser
          <select
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            className="focusable rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
                {option.linked ? "" : " (non rattachée)"}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button
        type="button"
        onClick={run}
        disabled={busy || !targetLinked}
        title={
          targetLinked ? undefined : "Rattachez d'abord la boutique à une boutique Jumia"
        }
        className="focusable inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
        {busy
          ? "Synchronisation…"
          : `Synchroniser les commandes${target ? ` de ${target.name}` : ""} (${days} j)`}
      </button>
      {!targetLinked ? (
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
