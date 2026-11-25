import type { Metadata } from "next";
import { OrderWorkspace } from "@/components/order-workspace";

export const metadata: Metadata = {
  title: "Prêtes à expédier",
};

const SOUS_VUES = [
  { href: "/commandes/a-traiter/en-attente", label: "En attente" },
  { href: "/commandes/a-traiter/pretes-a-expedier", label: "Prêtes à expédier" },
  { href: "/commandes/a-traiter/factures", label: "Factures à imprimer" },
];

/**
 * Sous-vue **Prêtes à expédier** de la rubrique B.
 *
 * Une commande n'est « prête à expédier » que si sa préparation est
 * **confirmée** : tous les articles sont emballés (`packedItems ≥ totalItems`)
 * et le statut n'indique ni attente ni annulation.
 *
 * L'expédition n'est pas faite : ces commandes ne figurent pas non plus
 * dans la rubrique « Expédiées », qui ne retient que les expéditions
 * confirmées.
 */
export default async function PretesAExpedierPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <OrderWorkspace
      title="Prêtes à expédier"
      description="Commandes dont la préparation est confirmée : tous les articles sont emballés, l'expédition reste à effectuer."
      searchParams={searchParams}
      parent="À traiter"
      subNav={SOUS_VUES}
      listNote="Seules les commandes prêtes à expédier sont listées ici."
      family="pretes-a-expedier"
      empty="Aucune commande prête à expédier sur cette période et ce périmètre."
      showSync
    />
  );
}
