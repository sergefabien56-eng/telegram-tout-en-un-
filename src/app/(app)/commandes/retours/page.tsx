import type { Metadata } from "next";
import { OrderWorkspace } from "@/components/order-workspace";

export const metadata: Metadata = {
  title: "Retours",
};

const SOUS_VUES = [
  { href: "/commandes/expediees", label: "Expédiées" },
  { href: "/commandes/retours", label: "Retours" },
];

/**
 * Sous-vue **Retours** de la rubrique C.
 *
 * Tous les retours sont regroupés ici, **sans** obligation de classer par
 * motif : le motif éventuel figure dans le détail de la commande, où il est
 *lu tel que Jumia l'a transmis. Aucun motif n'est inventé.
 */
export default async function RetoursPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <OrderWorkspace
      title="Retours"
      description="Tous les retours (retournées, remboursées, retours demandés), regroupés. Le motif éventuel est indiqué dans le détail de la commande."
      searchParams={searchParams}
      parent="Expédiées"
      subNav={SOUS_VUES}
      listNote="Tous les retours sont listés ici, quel que soit le motif."
      family="retours"
      empty="Aucun retour enregistré sur cette période et ce périmètre."
      showSync
    />
  );
}
