import type { Metadata } from "next";
import { OrderWorkspace } from "@/components/order-workspace";

export const metadata: Metadata = {
  title: "En attente",
};

const SOUS_VUES = [
  { href: "/commandes/a-traiter/en-attente", label: "En attente" },
  { href: "/commandes/a-traiter/pretes-a-expedier", label: "Prêtes à expédier" },
  { href: "/commandes/a-traiter/etiquettes", label: "Étiquettes à imprimer" },
];

/**
 * Sous-vue **En attente** de la rubrique B.
 *
 * Une commande est « en attente » quand sa préparation **n'est pas
 * confirmée** : statut d'attente et articles non emballés, ou encore
 * statuts multiples dont une partie seulement est préparée.
 *
 * Une commande à statuts multiples n'est jamais comptée comme prête : le
 * détail de la commande indique « préparation partielle (x/y) ».
 */
export default async function EnAttentePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <OrderWorkspace
      title="En attente"
      description="Commandes dont la préparation n'est pas confirmée : rien n'est encore emballé, ou seulement une partie des articles."
      searchParams={searchParams}
      parent="À traiter"
      subNav={SOUS_VUES}
      listNote="Seules les commandes dont la préparation n'est pas confirmée sont listées ici."
      family="en-attente"
      empty="Aucune commande en attente sur cette période et ce périmètre : toutes les commandes reçues ont une préparation confirmée."
      showSync
    />
  );
}
