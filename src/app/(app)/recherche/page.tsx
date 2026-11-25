import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { SpaceSearch } from "@/components/space-search";

export const dynamic = "force-dynamic";

/**
 * RECHERCHE — chercher dans tout son espace, depuis une page dédiée.
 *
 * Le champ de l'en-tête et celui de cette page interrogent la **même**
 * source (`/api/search`) : les résultats ne dépendent plus de l'endroit
 * où l'on cherche. Le serveur n'expose que les boutiques autorisées.
 */
export default async function RecherchePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recherche dans mon espace"
        description="Boutiques, produits et références : la recherche ne porte que sur ce à quoi vous avez droit."
      />

      <Section
        title="Que voulez-vous trouver ?"
        description="Deux caractères suffisent. Les résultats apparaissent au fil de la frappe."
      >
        <div className="max-w-2xl">
          <SpaceSearch variant="inline" autoFocus />
        </div>
      </Section>

      <p className="text-xs text-muted">
        La recherche interroge la base locale : elle ne renvoie que ce qui a été réellement
        synchronisé. Un produit absent n&apos;est pas « introuvable » — il n&apos;a jamais été reçu
        de Jumia.
      </p>
    </div>
  );
}
