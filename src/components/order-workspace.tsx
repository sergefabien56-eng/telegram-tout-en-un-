import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderFilters } from "@/components/order-filters";
import { OrderTable, type OrderTableRow } from "@/components/order-table";
import { OrderSyncPanel } from "@/components/order-sync-panel";
import { Collapsible } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { SubNav, type SubNavItem } from "@/components/sub-nav";
import {
  countOrdersForShops,
  listOrdersForShops,
  type OrderFilters as OrderFilterOptions,
} from "@/lib/orders";
import {
  isRefusedScope,
  orderScope,
  parseDay,
  readSearchValues,
  resolveShopIds,
} from "@/lib/order-access";
import { formatMoney } from "@/lib/money";
import { getSessionUser } from "@/lib/session";
import type { OrderFamily } from "@/lib/order-status";
import type { ReactNode } from "react";

/**
 * Socle commun des vues « commandes ».
 *
 * Il porte ce qui est **réellement commun** : le périmètre autorisé, les
 * filtres (boutique, Du, Au, Statut), les compteurs (nombre de commandes,
 * total affiché), l'origine des données et la liste repliable.
 *
 * Ce qui est propre à chaque vue — les sous-rubriques, les compteurs
 * spécifiques, les explications — est fourni par la page appelante : aucune
 * page n'est la copie d'une autre.
 */
export type OrderWorkspaceProps = {
  title: string;
  description: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  /** Sous-rubriques propres à cette vue. */
  subNav?: SubNavItem[];
  /** Libellé de la rubrique parente (contexte de navigation). */
  parent?: string;
  /** Contenu additionnel propre à la vue, affiché sous les compteurs. */
  children?: ReactNode;
  /**
   * Famille de commandes retenue par la vue. Le filtrage est appliqué **en
   * base**, avant la limite de lignes : la liste affichée et les compteurs
   * décrivent donc exactement le même ensemble.
   */
  family?: OrderFamily;
  /** Message affiché quand aucune commande ne correspond aux filtres. */
  empty: string;
  /** Affiche le panneau « Synchroniser cette période ». */
  showSync?: boolean;
  /** Nombre maximal de lignes listées (la liste reste dépliable). */
  limit?: number;
  /**
   * Précision affichée sous le compteur : elle explique ce que couvre la
   * liste par rapport aux autres sous-vues.
   */
  listNote?: string;
};

export async function OrderWorkspace({
  title,
  description,
  searchParams,
  subNav,
  parent,
  children,
  family,
  empty,
  showSync = false,
  limit = 200,
  listNote,
}: OrderWorkspaceProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const scope = await orderScope(user.id);
  const values = readSearchValues(await searchParams);

  if (scope.total === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">{title}</h1>
        <EmptyState
          title="Aucune boutique accessible"
          description="Créez d'abord une boutique, puis rattachez-la à une boutique Jumia : les commandes apparaîtront après la première synchronisation."
        />
      </div>
    );
  }

  if (scope.allowed.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">{title}</h1>
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
        <h1 className="text-2xl font-semibold text-night">{title}</h1>
        <EmptyState
          tone="danger"
          title="Cette boutique n’est pas dans votre périmètre"
          description="Aucune donnée ne peut être affichée pour une boutique à laquelle vous n’avez pas accès."
        />
      </div>
    );
  }

  const filtres: OrderFilterOptions = {
    status: values.statut,
    from: parseDay(values.du),
    to: parseDay(values.au, true),
    family,
  };

  // La famille est appliquée **en base** : la liste affichée correspond
  // exactement aux compteurs, même quand la limite de lignes est atteinte.
  const rows = await listOrdersForShops(shopIds, { ...filtres, limit });

  // Compteurs calculés sur **tous** les filtres, sans limite de lignes :
  // le nombre affiché correspond aux filtres et à la vue affichée — il ne
  // dépend pas du nombre de lignes effectivement rendues.
  const compteurs = await countOrdersForShops(shopIds, filtres);
  const totalAffiche = compteurs.currencies.length === 1 ? compteurs.totalMinor : null;
  const devise = compteurs.currencies.length === 1 ? compteurs.currencies[0]! : null;

  const tableRows: OrderTableRow[] = rows.map(({ order, shopName }) => ({ ...order, shopName }));
  const boutiqueFiltree =
    shopIds.length === 1 ? scope.allowed.find((row) => row.id === shopIds[0]) : undefined;
  const multi = shopIds.length > 1;

  // Données : source, fraîcheur, état de la synchronisation.
  const boutiquesDuPerimetre = scope.allowed.filter((shop) => shopIds.includes(shop.id));
  const jamaisSync = boutiquesDuPerimetre.filter((shop) => !shop.lastSyncAt);
  const enErreur = boutiquesDuPerimetre.filter(
    (shop) => shop.lastSyncStatus && shop.lastSyncStatus !== "ok",
  );
  const derniereSync = boutiquesDuPerimetre
    .map((shop) => shop.lastSyncAt)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const syncOptions = scope.allowed.map((shop) => ({
    id: shop.id,
    name: shop.name,
    linked: Boolean(shop.remoteShopId),
  }));
  const shopSync = boutiqueFiltree ?? scope.allowed[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">{title}</h1>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>

      {subNav && subNav.length > 0 ? <SubNav items={subNav} parent={parent ?? title} /> : null}

      {/* Contrôles de consultation */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Période affichée</h2>
        <OrderFilters shops={scope.allowed} values={values} currentShopId={scope.currentShopId} />
        <p className="mt-3 text-xs text-muted" role="status">
          {boutiqueFiltree ? (
            <>
              Filtre actif : <span className="font-medium text-night">{boutiqueFiltree.name}</span>{" "}
              — seules ses commandes sont affichées.
            </>
          ) : multi ? (
            <>
              Filtre actif : <span className="font-medium text-night">toutes les boutiques</span> —
              les commandes sont regroupées, chaque ligne indique sa boutique.
            </>
          ) : null}
        </p>
      </section>

      {/* Compteurs et origine des données */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Commandes</p>
          <p className="mt-3 text-3xl font-semibold text-night">{compteurs.orders}</p>
          <p className="mt-1 text-xs text-muted">
            {boutiqueFiltree
              ? `Boutique ${boutiqueFiltree.name} uniquement.`
              : "Toutes les boutiques autorisées confondues."}
            {listNote ?? "La liste ne contient que les commandes de cette vue."}
            {rows.length >= limit ? ` Elle est limitée à ${limit} lignes.` : ""}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total affiché</p>
          <p className="mt-3 text-2xl font-semibold text-night">
            {totalAffiche !== null && devise ? formatMoney(totalAffiche, devise) : "—"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {compteurs.currencies.length > 1
              ? "Devises multiples : total non additionné."
              : "Montants des commandes affichées. Ce n’est pas le CA encaissé : une commande livrée ou expédiée n’est pas nécessairement encaissée."}
          </p>
        </div>
        <div className="card p-5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Données</h2>
          <p className="mt-3 text-sm text-night">
            Source : API Jumia Vendor Center (table des commandes), après synchronisation.
          </p>
          <p className="mt-1 text-xs text-muted">
            {jamaisSync.length > 0 ? (
              <span className="text-danger">
                {jamaisSync.length} boutique(s) jamais synchronisée(s) : les commandes affichées
                peuvent être incomplètes.
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
              {enErreur.length} boutique(s) avec une synchronisation non réussie (
              {enErreur.map((shop) => shop.lastSyncStatus).join(", ")}) : les données peuvent être
              partielles.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {compteurs.orders > 0 ? (
              <Link
                href={
                  multi
                    ? `/api/commandes/export?shopIds=${shopIds.join(",")}${
                        values.du ? `&from=${values.du}` : ""
                      }${values.au ? `&to=${values.au}` : ""}${
                        values.statut ? `&status=${encodeURIComponent(values.statut)}` : ""
                      }`
                    : `/api/shops/${shopIds[0]}/commandes/export?${
                        values.du ? `from=${values.du}` : ""
                      }${values.au ? `&to=${values.au}` : ""}${
                        values.statut ? `&status=${encodeURIComponent(values.statut)}` : ""
                      }`
                }
                className="focusable inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-night hover:bg-surface"
                download
              >
                Exporter la sélection (CSV)
              </Link>
            ) : (
              <span className="text-xs text-muted">
                Rien à exporter : aucune commande ne correspond aux filtres.
              </span>
            )}
            <Link
              href="/commandes/exports"
              className="focusable text-xs text-muted underline underline-offset-2 hover:text-night"
            >
              Historique des exports
            </Link>
          </div>
        </div>
      </section>

      {children}

      {/* Liste repliable. Sans aucune commande, l'état vide est montré
          directement : un message caché ne serait pas honnête. */}
      {rows.length === 0 ? (
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-night">Commandes</h2>
          <p role="status" className="mt-2 text-sm text-muted">
            {empty}
          </p>
        </section>
      ) : (
        <Collapsible
          title="Commandes"
          description="La liste est repliée pour garder la page lisible : chaque commande ouvre son propre détail."
          openLabel={`Afficher la liste (${rows.length})`}
          closeLabel="Masquer la liste"
        >
          <OrderTable rows={tableRows} showShop={multi} empty={empty} />
        </Collapsible>
      )}

      {showSync ? (
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-night">Synchroniser cette période</h2>
          <p className="mt-1 text-xs text-muted">
            Les commandes sont relues depuis Jumia sur les dates choisies, puis enregistrées. Les
            changements de statut des commandes plus anciennes sont également relus.
          </p>
          <div className="mt-3">
            <OrderSyncPanel
              shopId={shopSync?.id ?? ""}
              options={syncOptions}
              lastSuccessAt={derniereSync ? new Date(derniereSync).toISOString() : null}
              lastSyncAt={
                boutiquesDuPerimetre
                  .map((shop) => shop.lastSyncAt)
                  .filter((date): date is Date => Boolean(date))
                  .sort((a, b) => b.getTime() - a.getTime())[0]
                  ?.toISOString() ?? null
              }
              lastStatus={boutiqueFiltree?.lastSyncStatus ?? null}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
