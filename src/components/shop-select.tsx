"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ScopedShop } from "@/lib/shop-scope";

type Props = {
  shops: ScopedShop[];
  selected?: string;
  /** Boutique courante : périmètre par défaut quand aucun filtre n'est posé. */
  currentShopId?: string | null;
};

/** Valeur explicite du filtre « toutes les boutiques ». */
const ALL_SHOPS = "toutes";

/**
 * Filtre de boutique (une seule à la fois), borné au périmètre autorisé.
 *
 * Le changement de boutique est appliqué immédiatement et conserve les autres
 * filtres (période, statut). Sans cela, l'écran pouvait continuer d'afficher
 * « Toutes les boutiques » alors que le vendeur venait d'en choisir une :
 * c'est la source principale de confusion entre boutiques.
 */
export function ShopSelect({ shops, selected, currentShopId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (shops.length <= 1) return null;

  const effective = selected ?? currentShopId ?? ALL_SHOPS;
  const active = shops.find((shop) => shop.id === effective) ?? null;

  function apply(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("boutique", value);
    else params.delete("boutique");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  // Les autres filtres sont conservés quand on clique sur « Filtrer ».
  const preserved = [...searchParams.entries()].filter(([key]) => key !== "boutique");

  return (
    <div className="flex flex-wrap items-end gap-3">
      <form method="get" className="flex flex-wrap items-end gap-3">
        {preserved.map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Boutique
          <select
            name="boutique"
            defaultValue={effective}
            onChange={(event) => apply(event.target.value)}
            className="focusable rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
          >
            <option value={ALL_SHOPS}>Toutes ({shops.length})</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="focusable rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
        >
          Filtrer
        </button>
      </form>
      <p className="text-xs text-muted" role="status">
        {active ? (
          <>
            Filtre actif : <span className="font-medium text-night">{active.name}</span> — seules
            ses données sont affichées.
          </>
        ) : (
          <>
            Filtre actif :{" "}
            <span className="font-medium text-night">toutes les boutiques</span> — les données sont
            regroupées, chaque ligne indique sa boutique.
          </>
        )}
      </p>
    </div>
  );
}
