import type { Metadata } from "next";
import { OrderWorkspace } from "@/components/order-workspace";

export const metadata: Metadata = {
  title: "Expédiées",
};

const SOUS_VUES = [
  { href: "/commandes/expediees", label: "Expédiées" },
  { href: "/commandes/retours", label: "Retours" },
];

/**
 * Rubrique **C — Expédiées**, sous-vue **Expédiées**.
 *
 * « Expédiée » signifie **expédition réellement confirmée** par Jumia
 * (statuts `SHIPPED` / `PICKED_UP`). Les commandes livrées (`DELIVERED`)
 * restent consultables dans l'historique : une commande livrée a bien été
 * expédiée, mais l'information utile ici est le suivi du transport.
 */
export default async function ExpedieesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <OrderWorkspace
      title="Expédiées"
      description="Commandes dont l'expédition est confirmée par Jumia. Les livraisons terminées restent consultables dans « Toutes les commandes »."
      searchParams={searchParams}
      parent="Expédiées"
      subNav={SOUS_VUES}
      listNote="Seules les commandes expédiées sont listées ici ; les livraisons terminées restent dans l'historique."
      family="expediees"
      empty="Aucune commande expédiée sur cette période et ce périmètre."
      showSync
    />
  );
}
