import type { Metadata } from "next";
import { OrderWorkspace } from "@/components/order-workspace";

export const metadata: Metadata = {
  title: "Commandes annulées",
};

/**
 * Sous-vue **Annulées** de la rubrique A.
 *
 * Seules les commandes explicitement annulées par Jumia y figurent. Les
 * **échecs de livraison** n'en font pas partie : une commande qui n'a pas pu
 * être livrée n'a pas été annulée par le client, et les deux suivi sont
 * différents.
 */
export default async function CommandesAnnuleesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <OrderWorkspace
      title="Commandes annulées"
      description="Commandes annulées sur la période et le périmètre retenus. Les échecs de livraison restent comptés avec les commandes : seul le statut « annulée » est listé ici."
      searchParams={searchParams}
      parent="Toutes les commandes"
      subNav={[
        { href: "/commandes", label: "Historique" },
        { href: "/commandes/annulees", label: "Annulées" },
      ]}
      listNote="Seules les commandes annulées sont listées ici."
      family="annulees"
      empty="Aucune commande annulée sur cette période et ce périmètre."
      showSync
    />
  );
}
