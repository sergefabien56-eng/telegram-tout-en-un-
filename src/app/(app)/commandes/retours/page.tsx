import { OrderGroupPage } from "@/components/order-group-page";

export const dynamic = "force-dynamic";

/** Retours : commandes retournées ou remboursées. */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <OrderGroupPage
      group="returned"
      title="Retours"
      description="Commandes retournées ou rembourisées : suivez l'état des articles et des décisions à prendre."
      empty="Aucun retour ni remboursement enregistré sur cette période."
      searchParams={searchParams}
    />
  );
}
