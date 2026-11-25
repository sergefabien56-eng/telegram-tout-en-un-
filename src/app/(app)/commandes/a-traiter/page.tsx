import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderFilters } from "@/components/order-filters";
import { SubNav } from "@/components/sub-nav";
import { EmptyState } from "@/components/ui/empty-state";
import { countOrdersForShops } from "@/lib/orders";
import {
  isRefusedScope,
  orderScope,
  parseDay,
  readSearchValues,
  resolveShopIds,
} from "@/lib/order-access";
import { getSessionUser } from "@/lib/session";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = {
  title: "À traiter",
};

/**
 * Rubrique **B — À traiter** : point d'entrée vers trois sous-vues qui ont
 * chacune leur propre contenu.
 *
 * Les compteurs affichés ici reprennent exactement les définitions des
 * sous-vues (préparation non confirmée / préparation confirmée / factures),
 * de sorte que l'utilisateur sache où aller avant de cliquer.
 */
export default async function ATraiterPage({
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
        <h1 className="text-2xl font-semibold text-night">À traiter</h1>
        <EmptyState
          title="Aucune boutique accessible"
          description="Créez une boutique et rattachez-la à une boutique Jumia : les commandes à traiter apparaîtront après la première synchronisation."
        />
      </div>
    );
  }
  if (scope.allowed.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-night">À traiter</h1>
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
        <h1 className="text-2xl font-semibold text-night">À traiter</h1>
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

  // Les compteurs sont calculés **en base**, avec les mêmes définitions que
  // les sous-vues : ils ne dépendent pas du nombre de lignes listées.
  const [enAttenteCompteur, pretesCompteur] = await Promise.all([
    countOrdersForShops(shopIds, { ...filtres, family: "en-attente" }),
    countOrdersForShops(shopIds, { ...filtres, family: "pretes-a-expedier" }),
  ]);

  const enAttente = enAttenteCompteur.orders;
  const pretes = pretesCompteur.orders;

  // Le total affiché porte sur les commandes **à traiter** (celles des deux
  // sous-vues), pas sur tout le périmètre : le chiffre et le montant
  // décrivent le même ensemble.
  const totalATraiter = enAttenteCompteur.totalMinor + pretesCompteur.totalMinor;
  const devisesATraiter = [
    ...new Set([...enAttenteCompteur.currencies, ...pretesCompteur.currencies]),
  ];

  const sousVues = [
    {
      href: "/commandes/a-traiter/en-attente",
      label: "En attente",
      nombre: enAttente,
      description:
        "Préparation non confirmée : la commande n'est pas encore emballée, ou seulement en partie.",
    },
    {
      href: "/commandes/a-traiter/pretes-a-expedier",
      label: "Prêtes à expédier",
      nombre: pretes,
      description:
        "Préparation confirmée : tous les articles sont emballés, l'expédition reste à faire.",
    },
    {
      href: "/commandes/a-traiter/factures",
      label: "Factures à imprimer",
      nombre: null,
      description:
        "L'API Jumia Vendor Center utilisée ne fournit pas de factures : aucune facture n'est inventée ici.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-night">À traiter</h1>
        <p className="mt-1 text-sm text-muted">
          Les commandes qui demandent une action avant l&apos;expédition. Chaque sous-vue a ses
          propres filtres et son propre contenu.
        </p>
      </div>

      <SubNav
        items={sousVues.map((vue) => ({ href: vue.href, label: vue.label, count: vue.nombre }))}
        parent="À traiter"
      />

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">Période affichée</h2>
        <OrderFilters shops={scope.allowed} values={values} currentShopId={scope.currentShopId} />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Commandes à traiter
          </p>
          <p className="mt-3 text-3xl font-semibold text-night">{enAttente + pretes}</p>
          <p className="mt-1 text-xs text-muted">
            Commandes du périmètre filtré dont la préparation n&apos;est pas terminée. Ce total
            n&apos;est pas le chiffre d&apos;affaires : il compte des commandes.
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total affiché</p>
          <p className="mt-3 text-2xl font-semibold text-night">
            {devisesATraiter.length === 1 ? formatMoney(totalATraiter, devisesATraiter[0]!) : "—"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {devisesATraiter.length > 1
              ? "Devises multiples : total non additionné."
              : "Montant des commandes à traiter (en attente + prêtes à expédier). Ce n'est pas le CA encaissé."}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Données</p>
          <p className="mt-3 text-sm text-night">
            Source : API Jumia Vendor Center, après synchronisation des commandes.
          </p>
          <p className="mt-1 text-xs text-muted">
            Les compteurs ci-dessus suivent les filtres (boutique, Du, Au) ; le filtre Statut de
            l&apos;historique ne s&apos;applique pas ici.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {sousVues.map((vue) => (
          <Link
            key={vue.href}
            href={vue.href}
            className="focusable card block p-5 transition hover:border-primary/40"
          >
            <h2 className="text-sm font-semibold text-night">{vue.label}</h2>
            <p className="mt-3 text-2xl font-semibold text-night">
              {vue.nombre === null ? "—" : vue.nombre}
            </p>
            <p className="mt-2 text-xs text-muted">{vue.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
