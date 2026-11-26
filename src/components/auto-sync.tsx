"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Rafraîchissement automatique des données Jumia.
 *
 * **Ce que fait ce composant.** Il interroge périodiquement l'état de
 * fraîcheur des boutiques du périmètre et, si les données sont périmées,
 * demande une relecture à l'API Jumia. Quand la relecture a produit du
 * nouveau, la page se rafraîchit **seule** : le vendeur voit sa nouvelle
 * commande sans cliquer sur « Synchroniser ».
 *
 * **Pourquoi un polling.** L'API Vendor Center de Jumia n'expose aucun
 * webhook : la seule façon d'apprendre qu'une commande est arrivée est de
 * **relire** l'API. La fenêtre rejouée est courte (7 jours) et les
 * requêtes sont déjà limitées par le client (4 req/s, 200 req/min).
 *
 * **Ce que ce composant ne fait pas.** Il n'imprime aucune étiquette et ne
 * modifie rien chez Jumia : il ne fait que rapporter la donnée réelle.
 */

/** Délai entre deux vérifications (ms). */
const INTERVALLE_VERIFICATION = 15_000;

/** Chemins où la fraîcheur des commandes est pertinente. */
const CHEMINS_COMMANDES = ["/commandes", "/dashboard"];

function cheminSurveille(pathname: string): boolean {
  return CHEMINS_COMMANDES.some(
    (chemin) => pathname === chemin || pathname.startsWith(`${chemin}/`),
  );
}

type EtatBoutique = {
  shopId: string;
  lastSyncAt: string | null;
  syncInProgress: boolean;
  stale: boolean;
};

export function AutoSync({ shopIds }: { shopIds: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  // Nombre de rafraîchissements déclenchés par le composant. Exposé dans le
  // DOM : c'est la preuve observable que la page s'est mise à jour seule.
  const [rafraichissements, setRafraichissements] = useState(0);
  // Mémorise la date de la dernière synchronisation **connue du rendu** :
  // c'est la référence pour détecter qu'une relecture a produit du neuf.
  const referenceRef = useRef<Map<string, string | null>>(new Map());
  const shopsRef = useRef(shopIds);
  shopsRef.current = shopIds;

  const surveille = cheminSurveille(pathname);

  useEffect(() => {
    if (!surveille) return;
    const shops = shopsRef.current;
    if (shops.length === 0) return;

    let annule = false;

    const verifier = async () => {
      for (const shopId of shops) {
        if (annule) return;

        let etat: EtatBoutique | null = null;
        try {
          const reponse = await fetch(`/api/shops/${shopId}/auto-sync`, {
            method: "GET",
            cache: "no-store",
          });
          if (!reponse.ok) continue;
          const corps = (await reponse.json()) as { data?: EtatBoutique };
          etat = corps.data ?? null;
        } catch {
          continue;
        }
        if (!etat || annule) continue;

        // Première observation : on mémorise la référence, sans rien faire.
        if (!referenceRef.current.has(shopId)) {
          referenceRef.current.set(shopId, etat.lastSyncAt);
          if (etat.stale) {
            void demarrer(shopId);
          }
          continue;
        }

        // La relecture a produit du neuf : la page est rafraîchie.
        const reference = referenceRef.current.get(shopId) ?? null;
        if (etat.lastSyncAt && etat.lastSyncAt !== reference) {
          referenceRef.current.set(shopId, etat.lastSyncAt);
          setEnCours(false);
          setRafraichissements((n) => n + 1);
          router.refresh();
          return;
        }

        if (etat.stale && !etat.syncInProgress) {
          void demarrer(shopId);
        }
      }
    };

    const demarrer = async (shopId: string) => {
      try {
        const reponse = await fetch(`/api/shops/${shopId}/auto-sync`, {
          method: "POST",
          cache: "no-store",
        });
        if (!reponse.ok) return;
        const corps = (await reponse.json()) as { data?: { started?: boolean } };
        if (corps.data?.started) setEnCours(true);
      } catch {
        // Un échec réseau ne doit rien casser : la vérification suivante
        // repartira.
      }
    };

    void verifier();
    const minuteur = setInterval(() => {
      void verifier();
    }, INTERVALLE_VERIFICATION);

    return () => {
      annule = true;
      clearInterval(minuteur);
    };
  }, [surveille, router]);

  return (
    <>
      {/* Compteur observable : prouve que la page s'est rafraîchie seule. */}
      <span
        data-auto-sync-refreshes={rafraichissements}
        className="sr-only"
        aria-hidden="true"
      />
      {surveille && enCours ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 rounded-lg border border-primary/30 bg-white px-4 py-3 text-sm text-night shadow-lg"
        >
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2 w-2 animate-pulse rounded-full bg-primary"
            />
            Actualisation des données Jumia…
          </span>
        </div>
      ) : null}
    </>
  );
}
