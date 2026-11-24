import { OrderGroupPage } from "@/components/order-group-page";

export const dynamic = "force-dynamic";

/** À traiter : commandes qui attendent une action (préparation, expédition…). */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <OrderGroupPage
      group="action"
      title="À traiter"
      description="Commandes encore chez vous : préparez, emballez puis remettez à Jumia."
      empty="Aucune commande en attente de traitement sur cette période. Les commandes déjà expédiées ou livrées restent visibles dans « Toutes les commandes »."
      searchParams={searchParams}
    />
  );
}
