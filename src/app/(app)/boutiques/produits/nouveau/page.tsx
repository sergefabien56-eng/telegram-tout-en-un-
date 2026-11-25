import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProductCreationForm } from "@/components/product-creation-form";

/**
 * « Ajouter un produit ».
 *
 * La fiche est toujours créée **pour une boutique choisie** : un produit
 * n'existe pas seul. La boutique peut être présélectionnée depuis la carte
 * d'une boutique (« Toutes les boutiques »).
 */
export default async function AjouterProduitPage({
  searchParams,
}: {
  searchParams: Promise<{ boutique?: string }>;
}) {
  const params = await searchParams;
  const boutique = typeof params.boutique === "string" ? params.boutique : undefined;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/boutiques"
          className="focusable inline-flex items-center gap-1.5 text-xs text-muted hover:text-night"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Toutes les boutiques
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-night">Ajouter un produit</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          La fiche est rattachée à une boutique, contrôlée par les attributs réellement exigés par
          Jumia pour la catégorie choisie, puis envoyée à la plateforme. La publication est{" "}
          <strong>asynchrone</strong> : l&apos;état réel est vérifié chez Jumia.
        </p>
      </div>

      <ProductCreationForm shopIdPreselected={boutique} />
    </div>
  );
}
