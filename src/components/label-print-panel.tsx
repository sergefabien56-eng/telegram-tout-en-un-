"use client";

import { useState } from "react";
import { Printer, TriangleAlert } from "lucide-react";

type SyncOption = { id: string; name: string; linked: boolean };

type Props = {
  /** Boutique par défaut (celle filtrée) ; le sélecteur permet d'en changer. */
  shopId: string;
  options: SyncOption[];
  /** Nombre d'articles prêts à expédier et sans étiquette. */
  eligibleCount?: number | null;
  /**
   * Période affichée à l'écran (`JJ-MM-AAAA`). L'impression porte sur les
   * commandes de cette période ; sans période, elle porte sur toutes les
   * commandes éligibles de la boutique.
   */
  from?: string;
  to?: string;
  /** Rappelé à la fin de l'opération. */
  onFinished?: () => void;
};

/**
 * « Imprimer les étiquettes ».
 *
 * L'opération appelle `POST /orders/print-labels` chez Jumia. Les états
 * affichés sont factuels : ce qui a été produit, ce qui a été refusé par
 * Jumia, ce qui n'est pas encore disponible. Aucune réponse partielle n'est
 * annoncée comme une réussite complète.
 */
export function LabelPrintPanel({
  shopId,
  options,
  eligibleCount,
  from,
  to,
  onFinished,
}: Props) {
  const [targetId, setTargetId] = useState(shopId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const target = options.find((option) => option.id === targetId) ?? options[0];
  const targetShopId = target?.id ?? shopId;
  const linked = target?.linked ?? false;

  async function run() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/shops/${targetShopId}/etiquettes/generer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const payload =
        ((await response.json().catch(() => null)) as {
          ok: boolean;
          data?: {
            orders?: number;
            items?: number;
            packages?: number;
            errors?: number;
            pending?: number;
          };
          error?: string;
        }) ?? null;

      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "Impression impossible.");
        return;
      }
      const data = payload.data;
      setMessage(
        `${data?.packages ?? 0} étiquette(s) disponible(s) · ${data?.errors ?? 0} article(s) refusé(s) par Jumia · ${data?.pending ?? 0} pas encore disponible(s).`,
      );
    } catch {
      setError("Erreur réseau pendant l'impression des étiquettes.");
    } finally {
      setBusy(false);
      onFinished?.();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Boutique
          <select
            value={targetShopId}
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
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !linked}
          title={linked ? undefined : "Rattachez d'abord la boutique à une boutique Jumia"}
          className="focusable inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Printer className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`} aria-hidden="true" />
          {busy ? "Impression en cours…" : "Imprimer les étiquettes"}
        </button>
      </div>

      {!linked ? (
        <p className="text-xs text-muted">
          Rattachez la boutique à une boutique Jumia pour activer l&apos;impression des
          étiquettes.
        </p>
      ) : null}

      {typeof eligibleCount === "number" ? (
        <p className="text-xs text-muted">
          {eligibleCount} article(s) prêt(s) à expédier et sans numéro de suivi :{" "}
          {eligibleCount > 0
            ? "ils seront proposés à l'impression."
            : "aucun article à imprimer pour le moment. Jumia refuse d'imprimer une étiquette pour un colis déjà suivi."}
        </p>
      ) : null}

      <p className="text-xs text-muted">
        {from || to
          ? `L'impression porte sur les commandes de la période affichée (${from || "début"} → ${to || "aujourd'hui"}).`
          : "L'impression porte sur toutes les commandes éligibles de la boutique, période non restreinte."}
      </p>

      {busy ? (
        <p role="status" className="text-sm text-muted">
          Impression en cours… les étiquettes sont demandées à Jumia puis enregistrées.
        </p>
      ) : null}

      {message ? (
        <p role="status" className="text-sm text-success">
          {message}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
