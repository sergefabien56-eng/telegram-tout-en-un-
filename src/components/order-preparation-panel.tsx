"use client";

import { PackageCheck, Truck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * PRÉPARATION D'UNE COMMANDE — préparer les articles, puis demander le
 * passage « Prêtes à expédier ».
 *
 * **Ce que fait ce panneau.** Il montre les articles de la commande et les
 * informations d'expédition nécessaires (transporteur proposé par Jumia),
 * puis appelle l'API Jumia : `POST /orders/pack` pour emballer, et
 * `POST /orders/ready-to-ship` pour demander le passage « Prêtes à expédier ».
 *
 * **Ce qu'il ne fait pas.** Il ne déclare jamais « expédié » : « Prêt à
 * expédier » est un état que **Jumia** confirme. Un refus ou une réussite
 * partielle sont affichés article par article, sans jamais être présentés
 * comme une réussite complète.
 *
 * **Confirmation explicite.** Le passage « Prêtes à expédier » demande une
 * confirmation dédiée : rien n'est envoyé à Jumia sans que le vendeur
 * l'ait validé.
 */

type Article = {
  id: string;
  name: string | null;
  sku: string | null;
  status: string;
  statusLabel: string;
  trackingNumber: string | null;
  countryCode: string | null;
  shipmentType: string | null;
  needsPreparation: boolean;
  readyToShip: boolean;
};

type Provider = { id: string; name: string; trackingCodeRequired: boolean };

type Etat = {
  orderId: string;
  shopName: string;
  orderNumber: string;
  family: string;
  articles: Article[];
  itemsToPrepare: string[];
  itemsReady: string[];
  canWrite: boolean;
  providers: Provider[];
  providersByItem: Record<string, string[]>;
  defaultProviderId: string | null;
  providersError: string | null;
};

type ItemOutcome = {
  id: string;
  ok: boolean;
  code: string | null;
  message: string | null;
  trackingNumber: string | null;
};

const FAMILLE_TEXTE: Record<string, string> = {
  "en-attente": "En attente de préparation",
  "pretes-a-expedier": "Prête à expédier",
  expediees: "Expédiée",
  livrees: "Livrée",
  annulees: "Annulée",
  "echec-livraison": "Échec de livraison",
  retours: "Retour",
};

export function OrderPreparationPanel({
  orderId,
  canWrite,
}: {
  orderId: string;
  canWrite: boolean;
}) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [providerId, setProviderId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resultats, setResultats] = useState<ItemOutcome[]>([]);
  const [confirmation, setConfirmation] = useState(false);

  const charger = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${orderId}/preparation`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as {
        ok: boolean;
        data?: Etat;
        error?: string;
      } | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        setErreur(payload?.error ?? "Préparation indisponible.");
        return;
      }
      setEtat(payload.data);
      setProviderId((current) => current || payload.data?.defaultProviderId || "");
      setSelection((current) => {
        const disponibles = payload.data?.itemsToPrepare ?? [];
        const conservees = current.filter((id) => disponibles.includes(id));
        return conservees.length > 0 ? conservees : disponibles;
      });
    } catch {
      setErreur("Préparation indisponible.");
    }
  }, [orderId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function envoyer(action: "pack" | "ready_to_ship") {
    if (!etat) return;
    // L'emballage ne concerne que les articles qui ne sont pas déjà
    // emballés ; le passage « prêtes à expédier » peut porter tous les
    // articles sélectionnés.
    const itemIds =
      action === "pack"
        ? selection.filter((id) => etat.itemsToPrepare.includes(id))
        : selection;
    if (itemIds.length === 0) {
      setErreur("Sélectionnez au moins un article.");
      return;
    }
    setBusy(true);
    setErreur(null);
    setMessage(null);
    setResultats([]);
    try {
      const response = await fetch(`/api/orders/${orderId}/preparation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          itemIds,
          shipmentProviderId: providerId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok: boolean;
        data?: {
          outcome: string;
          succeeded: ItemOutcome[];
          failed: ItemOutcome[];
          refusal?: string | null;
          error?: string | null;
          itemsToPrepare: string[];
        };
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok || !payload.data) {
        setErreur(payload?.error ?? "Jumia n'a pas confirmé l'opération.");
        return;
      }

      const data = payload.data;
      setResultats([...(data.succeeded ?? []), ...(data.failed ?? [])]);

      if (data.outcome === "succes") {
        setMessage(
          action === "pack"
            ? `${data.succeeded.length} article(s) préparé(s) : Jumia a créé le(s) colis.`
            : `${data.succeeded.length} article(s) confirmés « prêts à expédier » par Jumia.`,
        );
        setConfirmation(false);
      } else if (data.outcome === "refus") {
        setErreur(
          data.refusal ??
            data.error ??
            "Jumia a refusé la demande : aucun article n'a été modifié.",
        );
      } else {
        setMessage(
          `Résultat partiel : ${data.succeeded.length} article(s) accepté(s) par Jumia, ` +
            `${data.failed.length} refusé(s).`,
        );
      }
      await charger();
    } catch {
      setErreur("Jumia n'a pas confirmé l'opération.");
    } finally {
      setBusy(false);
    }
  }

  if (!etat) {
    return (
      <p className="mt-3 text-sm text-muted">
        {erreur ?? "Chargement des articles…"}
      </p>
    );
  }

  const aPreparer = etat.articles.filter((article) => article.needsPreparation);
  const prets = etat.articles.filter((article) => article.readyToShip);
  // Le transporteur doit être proposé par Jumia pour **tous** les articles
  // sélectionnés : un lot ne peut pas mélanger deux transporteurs.
  const providersAutorises = etat.providers.filter((provider) =>
    selection.every((itemId) =>
      (etat.providersByItem[itemId] ?? []).includes(provider.id),
    ),
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-neutral">
          {FAMILLE_TEXTE[etat.family] ?? etat.family}
        </span>
        <span className="text-xs text-muted">
          {aPreparer.length} article(s) à préparer · {prets.length} prêt(s) à expédier
        </span>
      </div>

      {!canWrite ? (
        <p role="note" className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          Votre rôle permet de consulter cette commande, mais pas de la préparer. La préparation
          et le passage « Prêtes à expédier » sont réservés aux rôles autorisés sur cette boutique.
        </p>
      ) : null}

      {etat.articles.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">
                  <span className="sr-only">Sélection</span>
                </th>
                <th className="py-2 pr-3">Article</th>
                <th className="py-2 pr-3">Statut</th>
                <th className="py-2 pr-3">Pays</th>
                <th className="py-2 pr-3">Expédition</th>
              </tr>
            </thead>
            <tbody>
              {etat.articles.map((article) => {
                const selectionnable = article.needsPreparation || article.readyToShip;
                return (
                  <tr key={article.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3">
                      <input
                        type="checkbox"
                        className="focusable h-4 w-4 rounded border-border"
                        checked={selection.includes(article.id)}
                        disabled={!canWrite || busy || !selectionnable}
                        aria-label={`Sélectionner ${article.name ?? article.id}`}
                        onChange={(event) => {
                          setSelection((current) =>
                            event.target.checked
                              ? [...current, article.id]
                              : current.filter((id) => id !== article.id),
                          );
                        }}
                      />
                    </td>
                    <td className="py-2.5 pr-3 text-night">
                      {article.name ?? "—"}
                      {article.sku ? (
                        <span className="ml-2 font-mono text-xs text-muted">{article.sku}</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="badge badge-neutral">{article.statusLabel}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-muted">{article.countryCode ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-muted">{article.shipmentType ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Aucun article enregistré pour cette commande. Les articles sont lus depuis Jumia lors de
          la synchronisation des commandes.
        </p>
      )}

      {canWrite && etat.articles.length > 0 ? (
        <div className="space-y-3">
          <div>
            <label htmlFor="transporteur" className="text-xs uppercase tracking-wide text-muted">
              Transporteur (proposé par Jumia)
            </label>
            <select
              id="transporteur"
              value={providerId}
              disabled={busy || etat.providers.length === 0}
              onChange={(event) => setProviderId(event.target.value)}
              className="focusable mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-night sm:w-80"
            >
              {etat.providers.length === 0 ? (
                <option value="">Aucun transporteur disponible</option>
              ) : null}
              {etat.providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
            {etat.providersError ? (
              <p className="mt-1 text-xs text-danger">{etat.providersError}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={
                busy ||
                selection.filter((id) => etat.itemsToPrepare.includes(id)).length === 0 ||
                !providerId
              }
              onClick={() => void envoyer("pack")}
              className="focusable inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
              Préparer les articles
            </button>
            <button
              type="button"
              disabled={busy || selection.length === 0}
              onClick={() => setConfirmation(true)}
              className="focusable inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-night hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Truck className="h-4 w-4" aria-hidden="true" />
              Demander « Prêtes à expédier »
            </button>
          </div>

          {confirmation ? (
            <div
              role="alertdialog"
              aria-label="Confirmer le passage Prêtes à expédier"
              className="rounded-xl border border-warning/40 bg-warning/5 p-4"
            >
              <p className="text-sm font-medium text-night">
                Confirmer le passage « Prêtes à expédier » ?
              </p>
              <p className="mt-1 text-xs text-muted">
                Jumia marquera {selection.length} article(s) de la commande {etat.orderNumber} comme
                prêts à expédier. « Prêt à expédier » ne veut pas dire « expédié » : le transporteur
                n&apos;a pas encore pris le colis.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void envoyer("ready_to_ship")}
                  className="focusable rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Confirmer
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmation(false)}
                  className="focusable rounded-lg border border-border bg-card px-4 py-2 text-sm text-night hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {message}
        </p>
      ) : null}
      {erreur ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {erreur}
        </p>
      ) : null}

      {resultats.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-night">Résultat article par article</h3>
          <ul className="mt-2 space-y-1">
            {resultats.map((resultat) => (
              <li
                key={resultat.id}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  resultat.ok
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-danger/30 bg-danger/10 text-danger"
                }`}
              >
                <span className="font-mono">{resultat.id}</span> —{" "}
                {resultat.ok
                  ? `accepté par Jumia${resultat.trackingNumber ? ` (suivi ${resultat.trackingNumber})` : ""}`
                  : `${resultat.message ?? "refusé"}${resultat.code ? ` (${resultat.code})` : ""}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {prets.length > 0 ? (
        <p className="text-xs text-muted">
          {prets.length} article(s) sont déjà confirmés « prêts à expédier » par Jumia.
        </p>
      ) : null}

      {providersAutorises.length === 0 && etat.providers.length > 0 ? (
        <p className="text-xs text-muted">
          Aucun transporteur n&apos;est proposé pour l&apos;ensemble des articles sélectionnés :
          Jumia exige un même transporteur, un même pays et un même mode d&apos;expédition pour
          les articles d&apos;un même colis.
        </p>
      ) : null}
    </div>
  );
}
