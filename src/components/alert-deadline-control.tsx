"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * SEUIL DE PRÉPARATION D'UNE BOUTIQUE.
 *
 * Les délais de préparation diffèrent d'une boutique et d'un processus à
 * l'autre, et l'API Vendor Center de Jumia n'en expose aucun : le seuil est
 * donc une **règle saisie par le vendeur**, pas une donnée inventée par
 * l'application. 24 h reste la valeur par défaut.
 *
 * Le seuil est un repère de **priorisation** : il n'entraîne aucune
 * annulation automatique de commande.
 */
export function AlertDeadlineControl({
  shopId,
  hours,
  canEdit,
}: {
  shopId: string;
  hours: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [valeur, setValeur] = useState(String(hours));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer() {
    const heures = Number(valeur);
    setBusy(true);
    setMessage(null);
    setErreur(null);
    try {
      const response = await fetch(`/api/shops/${shopId}/alertes/delai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heures }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !payload?.ok) {
        setErreur(payload?.error ?? "Seuil non enregistré.");
        return;
      }
      setMessage("Seuil enregistré. Les alertes ont été recalculées.");
      router.refresh();
    } catch {
      setErreur("Seuil non enregistré.");
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) {
    return (
      <p className="text-xs text-muted">
        Seuil de préparation de cette boutique : <span className="text-night">{hours} h</span>.
        Seuls les rôles autorisés peuvent le modifier.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <label htmlFor="seuil-preparation" className="text-xs uppercase tracking-wide text-muted">
        Seuil de préparation
      </label>
      <input
        id="seuil-preparation"
        type="number"
        min={1}
        max={240}
        value={valeur}
        onChange={(event) => setValeur(event.target.value)}
        className="focusable w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-night"
      />
      <span>heures</span>
      <button
        type="button"
        onClick={() => void enregistrer()}
        disabled={busy}
        className="focusable rounded-lg border border-border bg-card px-3 py-1.5 font-medium text-night hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
      >
        Enregistrer
      </button>
      {message ? <span className="text-success">{message}</span> : null}
      {erreur ? <span className="text-danger">{erreur}</span> : null}
      <span className="w-full text-muted">
        Repère de priorisation : au-delà, l&apos;alerte passe en retard. Ce seuil n&apos;est pas une
        heure d&apos;annulation automatique.
      </span>
    </div>
  );
}
