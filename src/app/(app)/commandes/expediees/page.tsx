import { OrderGroupPage } from "@/components/order-group-page";

export const dynamic = "force-dynamic";

/** Expédiées : commandes parties vers les clients. */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <OrderGroupPage
      group="shipped"
      title="Expédiées"
      description="Commandes remises au transport et en route vers les clients."
      empty="Aucune commande expédiée sur cette période. Les livraisons terminées (DELIVERED) restent consultables dans « Toutes les commandes »."
      searchParams={searchParams}
    />
  );
}
