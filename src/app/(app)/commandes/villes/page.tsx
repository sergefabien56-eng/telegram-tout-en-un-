import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderFilters } from "@/components/order-filters";
import { EmptyState } from "@/components/ui/empty-state";
import { listOrderCities } from "@/lib/orders";
import {
  isRefusedScope,
  orderScope,
  parseDay,
  readSearchValues,
  resolveShopIds,
} from "@/lib/order-access";
import { formatMoney } from "@/lib/money";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Villes & localités",
};

/**
 * En dessous de ce nombre de commandes, un pourcentage n'a pas de sens :
 * on affiche l'effectif et on signale l'échantillon comme insuffisant.
 */
const SEUIL_ECHTILLON = 10;

/** Normalise un libellé de ville libre (casse, espaces, ponctuation). */
function normaliser(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export default async function VillesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const scope = await orderScope(user.id);
  const values = readSearchValues(await searchParams);

  if (scope.total === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Villes & localités</h1>
        <EmptyState
          title="Aucune boutique accessible"
          description="Rattachez une boutique à Jumia et lancez une synchronisation : les localités apparaîtront à partir des commandes reçues."
        />
      </div>
    );
  }
  if (scope.allowed.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Villes & localités</h1>
        <EmptyState
          tone="danger"
          title="Accès refusé"
          description="Votre rôle ne permet pas de consulter les commandes de vos boutiques."
        />
      </div>
    );
  }

  const shopIds = resolveShopIds(values.boutique, scope.allowed, scope.currentShopId);
  if (isRefusedScope(values, shopIds)) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">Villes & localités</h1>
        <EmptyState
          tone="danger"
          title="Cette boutique n’est pas dans votre périmètre"
          description="Aucune donnée ne peut être affichée pour une boutique à laquelle vous n’avez pas accès."
        />
      </div>
    );
  }

  const filtres = {
    from: parseDay(values.du),
    to: parseDay(values.au, true),
  };

  const villes = await listOrderCities(shopIds, filtres);

  // Normalisation des libellés libres : Jumia renvoie aussi des points
  // relais et des quartiers dans le même champ. On regroupe les libellés
  // identiques après normalisation, sans les confondre avec d'autres.
  const regroupees = new Map<
    string,
    {
      libelle: string;
      commandes: number;
      livrees: number;
      expediees: number;
      annulees: number;
      echecs: number;
      retours: number;
      totalMinor: number;
      devise: string;
    }
  >();
  for (const ville of villes) {
    const cle = normaliser(ville.city).toLowerCase();
    const existant = regroupees.get(cle);
    if (!existant) {
      regroupees.set(cle, {
        libelle: normaliser(ville.city),
        commandes: ville.orders,
        livrees: ville.delivered,
        expediees: ville.shipped,
        annulees: ville.canceled,
        echecs: ville.failed,
        retours: ville.returned,
        totalMinor: ville.totalMinor,
        devise: ville.currency,
      });
      continue;
    }
    existant.commandes += ville.orders;
    existant.livrees += ville.delivered;
    existant.expediees += ville.shipped;
    existant.annulees += ville.canceled;
    existant.echecs += ville.failed;
    existant.retours += ville.returned;
    existant.totalMinor += ville.totalMinor;
  }

  const lignes = [...regroupees.values()].sort((a, b) => b.commandes - a.commandes);

  const totalCommandes = lignes.reduce((acc, ligne) => acc + ligne.commandes, 0);
  const totalEchecs = lignes.reduce((acc, ligne) => acc + ligne.echecs, 0);
  const totalAnnulees = lignes.reduce((acc, ligne) => acc + ligne.annulees, 0);
  const totalRetours = lignes.reduce((acc, ligne) => acc + ligne.retours, 0);
  const totalMontant = lignes.reduce((acc, ligne) => acc + ligne.totalMinor, 0);
  const devise = lignes[0]?.devise ?? null;
  const insuffisants = lignes.filter((ligne) => ligne.commandes < SEUIL_ECHTILLON).length;

  // Fraîcheur des données : elle est annoncée même quand il n'y a rien à
  // agréger, pour que l'utilisateur sache pourquoi la page est vide.
  const boutiquesDuPerimetre = scope.allowed.filter((shop) => shopIds.includes(shop.id));
  const jamaisSync = boutiquesDuPerimetre.filter((shop) => !shop.lastSyncAt);
  const enErreur = boutiquesDuPerimetre.filter(
    (shop) => shop.lastSyncStatus && shop.lastSyncStatus !== "ok",
  );
  const derniereSync = boutiquesDuPerimetre
    .map((shop) => shop.lastSyncAt)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">Villes & localités</h1>
        <p className="mt-1 text-sm text-muted">
          Répartition géographique des commandes du périmètre retenu. Seuls des volumes, des
          montants et des taux sont affichés — aucun nom, téléphone ou adresse de client.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Période affichée</h2>
        <OrderFilters
          shops={scope.allowed}
          values={values}
          currentShopId={scope.currentShopId}
        />
        <p className="mt-3 text-xs text-muted">
          Agrégats par boutique et par période. Le filtre « Statut » ne s&apos;applique pas ici :
          il fausserait le décompte des volumes géographiques.
        </p>
      </section>

      {/* Données : source, fraîcheur, alerte d'incomplétude — toujours visible. */}
      <section className="card p-5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Données</h2>
        <p className="mt-3 text-sm text-night">
          Source : API Jumia Vendor Center, lue dans les commandes synchronisées.
        </p>
        <p className="mt-1 text-xs text-muted">
          {jamaisSync.length > 0 ? (
            <span className="text-danger">
              {jamaisSync.length} boutique(s) jamais synchronisée(s) : aucune localité n’est
              disponible tant que la première synchronisation n’a pas eu lieu.
            </span>
          ) : derniereSync ? (
            <>
              Dernière synchronisation réussie :{" "}
              <span className="text-night">{new Date(derniereSync).toLocaleString("fr-FR")}</span>
            </>
          ) : (
            "Aucune synchronisation enregistrée."
          )}
        </p>
        {enErreur.length > 0 ? (
          <p className="mt-1 text-xs text-warning">
            {enErreur.length} boutique(s) avec une synchronisation non réussie : les agrégats peuvent
            être partiels.
          </p>
        ) : null}
      </section>

      {lignes.length === 0 ? (
        <EmptyState
          title="Aucune localité connue pour l’instant"
          description="Les localités sont lues dans les commandes synchronisées. Si la boutique n’a jamais été synchronisée, lancez une synchronisation pour les obtenir."
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Commandes</p>
              <p className="mt-3 text-3xl font-semibold text-night">{totalCommandes}</p>
              <p className="mt-1 text-xs text-muted">
                Commandes rattachées à une localité, sur la période et le périmètre retenus.
              </p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Montant affiché</p>
              <p className="mt-3 text-2xl font-semibold text-night">
                {devise ? formatMoney(totalMontant, devise) : "—"}
              </p>
              <p className="mt-1 text-xs text-muted">
                Montant des commandes agrégées. Ce n&apos;est pas le CA encaissé.
              </p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Échecs</p>
              <p className="mt-3 text-2xl font-semibold text-night">{totalEchecs}</p>
              <p className="mt-1 text-xs text-muted">
                Commandes dont la livraison a échoué (statut « FAILED »). Une annulation{" "}
                ({totalAnnulees}) n&apos;est pas un échec de livraison : les deux sont comptés à part.
              </p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Retours</p>
              <p className="mt-3 text-2xl font-semibold text-night">{totalRetours}</p>
              <p className="mt-1 text-xs text-muted">
                Retours regroupés, quel que soit le motif (indiqué dans le détail de la commande).
              </p>
            </div>
          </section>

          {insuffisants > 0 ? (
            <p role="note" className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-night">
              {insuffisants} localité(s) reposent sur moins de {SEUIL_ECHTILLON} commande(s) : leurs
              taux ne sont pas significatifs et sont signalés comme tels dans le tableau.
            </p>
          ) : null}

          <section className="card p-5">
            <h2 className="text-sm font-semibold text-night">Détail par localité</h2>
            <p className="mt-1 text-xs text-muted">
              Effectif indiqué à côté de chaque taux : un pourcentage seul serait trompeur sur un
              échantillon minuscule.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Localité</th>
                    <th className="py-2 pr-3">Commandes</th>
                    <th className="py-2 pr-3">Montant affiché</th>
                    <th className="py-2 pr-3">Livrées</th>
                    <th className="py-2 pr-3">Expédiées</th>
                    <th className="py-2 pr-3">Annulées</th>
                    <th className="py-2 pr-3">Échecs</th>
                    <th className="py-2 pr-3">Retours</th>
                    <th className="py-2 pr-3">Taux d’échec</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((ligne) => {
                    const effectif = ligne.commandes;
                    const significatif = effectif >= SEUIL_ECHTILLON;
                    const taux = effectif > 0 ? (ligne.echecs / effectif) * 100 : 0;
                    return (
                      <tr key={ligne.libelle} className="border-b border-border last:border-0">
                        <td className="py-2.5 pr-3 text-night">{ligne.libelle}</td>
                        <td className="py-2.5 pr-3 text-night">{effectif}</td>
                        <td className="py-2.5 pr-3 text-night">
                          {formatMoney(ligne.totalMinor, ligne.devise)}
                        </td>
                        <td className="py-2.5 pr-3 text-muted">{ligne.livrees}</td>
                        <td className="py-2.5 pr-3 text-muted">{ligne.expediees}</td>
                        <td className="py-2.5 pr-3 text-muted">{ligne.annulees}</td>
                        <td className="py-2.5 pr-3 text-muted">{ligne.echecs}</td>
                        <td className="py-2.5 pr-3 text-muted">{ligne.retours}</td>
                        <td className="py-2.5 pr-3">
                          {significatif ? (
                            <span className="text-night">
                              {taux.toFixed(1)} %{" "}
                              <span className="text-xs text-muted">
                                ({ligne.echecs}/{effectif})
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-warning">
                              {taux.toFixed(1)} % — échantillon insuffisant ({effectif})
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-muted">
              Le taux d&apos;échec = commandes en échec ÷ commandes de la même localité. Il ne
              s&apos;applique qu&apos;à partir de {SEUIL_ECHTILLON} commandes.
            </p>
            <p className="mt-2 text-xs text-muted">
              Besoin de la liste nominative des commandes ?{" "}
              <Link
                href="/commandes/clients"
                className="font-medium text-primary-600 underline underline-offset-2"
              >
                La page Clients
              </Link>{" "}
              reste accessible, hors de cette rubrique.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
