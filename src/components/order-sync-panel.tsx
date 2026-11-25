"use client";

import { useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { validateSyncWindow } from "@/lib/order-sync-policy";

type SyncOption = { id: string; name: string; linked: boolean };

type Props = {
  /** Boutique par défaut (celle filtrée) ; le sélecteur permet d'en changer. */
  shopId: string;
  options: SyncOption[];
  /** Date de la dernière synchronisation réussie (ISO ou null). */
  lastSuccessAt?: string | null;
  /** Date de la dernière synchronisation, qu'elle ait réussi ou non. */
  lastSyncAt?: string | null;
  /** État de la dernière synchronisation ("ok", "partial", "error"…). */
  lastStatus?: string | null;
  /** Rappelé à la fin d'une synchronisation (réussie, partielle ou en erreur). */
  onFinished?: () => void;
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function jourDeSemaine(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * « Synchroniser cette période ».
 *
 * L'utilisateur choisit les dates et la boutique ; la synchronisation part
 * sur cette période exacte. Au-delà de 30 jours, une **confirmation** est
 * demandée : la lecture est plus longue et consomme du quota Jumia.
 *
 * Les états affichés sont factuels : en attente, en cours, réussie, en
 * erreur, partielle. Aucune synchronisation partielle n'est annoncée comme
 * réussie.
 */
export function OrderSyncPanel({
  shopId,
  options,
  lastSuccessAt,
  lastSyncAt,
  lastStatus,
  onFinished,
}: Props) {
  const today = new Date();
  const [targetId, setTargetId] = useState(shopId);
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 29 * 86400000)));
  const [to, setTo] = useState(isoDay(today));
  const [followUpdates, setFollowUpdates] = useState(true);
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);

  const target = options.find((option) => option.id === targetId) ?? options[0];
  const targetShopId = target?.id ?? shopId;
  const linked = target?.linked ?? false;

  const debut = from ? new Date(`${from}T00:00:00.000Z`) : null;
  const fin = to ? new Date(`${to}T23:59:59.999Z`) : null;
  // Même validation que côté serveur : le refus est identique dans les deux
  // cas (période incomplète, inversée ou trop large).
  const fenetre = validateSyncWindow(debut, fin);
  const jours = fenetre.ok ? fenetre.spanDays : 0;
  const invalide = !fenetre.ok;
  const volumineux = fenetre.ok && fenetre.large;

  async function run() {
    setBusy(true);
    setMessage(null);
    setError(null);
    setPartial(false);
    try {
      const response = await fetch(`/api/shops/${targetShopId}/commandes/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          followUpdates,
        }),
      });
      const payload =
        ((await response.json().catch(() => null)) as {
          ok: boolean;
          data?: {
            orders: number;
            inserted: number;
            updated: number;
            pages: number;
            truncated: boolean;
            partial?: boolean;
            followedUpdates?: boolean;
            window?: { from: string; to: string };
          };
          error?: string;
        }) ?? null;

      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "Synchronisation impossible.");
        return;
      }
      const data = payload.data;
      const estPartielle = Boolean(data?.partial ?? data?.truncated);
      setPartial(estPartielle);
      if (estPartielle) {
        setMessage(
          `Lecture partielle : ${data?.orders ?? 0} commande(s) lue(s) sur ${data?.pages ?? 0} page(s). La limite de pages de l'API est atteinte — relancez pour compléter.`,
        );
        return;
      }
      setMessage(
        `Période ${data?.window?.from ?? from} → ${data?.window?.to ?? to} : ${data?.orders ?? 0} commande(s) lue(s), ${data?.inserted ?? 0} nouvelle(s), ${data?.updated ?? 0} mise(s) à jour.${
          data?.followedUpdates
            ? " Les commandes plus anciennes dont le statut a changé ont aussi été relues."
            : ""
        }`,
      );
      setConfirmation(false);
    } catch {
      setError("Erreur réseau pendant la synchronisation.");
    } finally {
      setBusy(false);
      onFinished?.();
    }
  }

  function onLancer() {
    // La période est validée **avant** tout : l'utilisateur sait
    // immédiatement si sa saisie est refusée, et pourquoi.
    if (!fenetre.ok) {
      setError(fenetre.reason);
      setConfirmation(false);
      return;
    }
    /* c8 ignore next 4 */
    if (!linked) {
      setError(
        "Cette boutique n'est rattachée à aucune boutique Jumia : rattachez-la avant de synchroniser.",
      );
      setConfirmation(false);
      return;
    }
    if (volumineux && !confirmation) {
      setConfirmation(true);
      setError(null);
      setMessage(null);
      return;
    }
    void run();
  }

  const dernierSucces = lastSuccessAt ? new Date(lastSuccessAt).toLocaleString("fr-FR") : "jamais";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Du
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
            className="focusable rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Au
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
            className="focusable rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
          />
        </label>
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
          onClick={onLancer}
          disabled={busy || !linked}
          title={linked ? undefined : "Rattachez d'abord la boutique à une boutique Jumia"}
          className="focusable inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
          {busy ? "Synchronisation en cours…" : "Synchroniser cette période"}
        </button>
      </div>

      {!fenetre.ok ? (
        <p role="alert" className="text-xs text-danger">
          {fenetre.reason}
        </p>
      ) : null}

      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={followUpdates}
          onChange={(event) => setFollowUpdates(event.target.checked)}
          className="focusable h-4 w-4 rounded border-border"
        />
        Relire aussi les commandes plus anciennes dont le statut a changé
        <span className="text-muted">
          (recommandé : sans cela, un changement de statut postérieur à la création passerait
          inaperçu)
        </span>
      </label>

      <p className="text-xs text-muted">
        La synchronisation porte sur la boutique choisie ci-dessus, jamais sur « la première ».
      </p>
      <p className="text-xs text-muted">
        Période sélectionnée : {jours > 0 ? `${jours} jour(s)` : "—"}
        {debut && fin && !invalide ? ` (${jourDeSemaine(debut)} → ${jourDeSemaine(fin)})` : ""}.
        Dernière synchronisation réussie : <strong className="text-night">{dernierSucces}</strong>
        {lastSyncAt
          ? ` · dernière tentative : ${new Date(lastSyncAt).toLocaleString("fr-FR")}`
          : ""}
        {lastStatus && lastStatus !== "ok" ? ` · état : ${lastStatus}` : ""}.
      </p>

      {!linked ? (
        <p className="text-xs text-muted">
          Rattachez la boutique à une boutique Jumia pour activer la synchronisation.
        </p>
      ) : null}

      {confirmation ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm"
        >
          <TriangleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span className="flex-1 text-night">
            Cette synchronisation va relire {jours} jours de commandes sur {target?.name}.
            L&apos;opération est plus longue et consomme du quota Jumia.
          </span>
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="focusable rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
          >
            Lancer quand même
          </button>
          <button
            type="button"
            onClick={() => setConfirmation(false)}
            className="focusable rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-night hover:bg-surface"
          >
            Annuler
          </button>
        </div>
      ) : null}

      {busy ? (
        <p role="status" className="text-sm text-muted">
          Synchronisation en cours… les commandes sont lues depuis Jumia puis enregistrées.
        </p>
      ) : null}

      {message ? (
        <p role="status" className={`text-sm ${partial ? "text-warning" : "text-success"}`}>
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
