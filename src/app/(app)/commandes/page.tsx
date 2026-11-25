import type { Metadata } from "next";
import { OrderWorkspace } from "@/components/order-workspace";

export const metadata: Metadata = {
  title: "Toutes les commandes",
};

/**
 * Rubrique **A — Toutes les commandes**, sous-vue **Historique**.
 *
 * La liste reprend toutes les commandes du périmètre filtré (hors annulées,
 * qui ont leur propre sous-vue). Les compteurs, eux, sont calculés sur
 * l'ensemble des commandes correspondant aux filtres : ils ne sont jamais
 * tronqués à la taille de la liste affichée.
 */
export default async function CommandesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <OrderWorkspace
      title="Toutes les commandes"
      description="Historique complet des commandes du périmètre autorisé, avec la période, la boutique et le statut retenus."
      searchParams={searchParams}
      parent="Toutes les commandes"
      subNav={[
        { href: "/commandes", label: "Historique" },
        { href: "/commandes/annulees", label: "Annulées" },
      ]}
      listNote="Les commandes annulées ont leur propre sous-vue ; l'historique les exclut."
      family="hors-annulees"
      empty="Aucune commande ne correspond aux filtres (période, boutique, statut). Élargissez la période ou retirez un filtre."
      showSync
    />
  );
}
