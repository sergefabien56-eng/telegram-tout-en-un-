"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Sélecteur de boutique **dans l'URL**.
 *
 * Le sélecteur de l'en-tête (cookie) reste la valeur par défaut de toutes les
 * pages. Celui-ci, lui, écrit `?boutique=` dans l'URL : le lien devient
 * partageable, le filtre est explicite dans l'historique, et un test peut
 * vérifier la page directement par son adresse.
 *
 * Il ne modifie **jamais** la boutique courante de l'utilisateur : il ne
 * change que l'affichage de l'écran.
 */
export function ShopScopeSelect({
  shops,
  value,
  allLabel = "Toutes mes boutiques",
  param = "boutique",
  allValue = "toutes",
}: {
  shops: { id: string; name: string }[];
  /** Identifiant de boutique affiché, `allValue` pour l'agrégat, `""` si aucun. */
  value: string;
  allLabel?: string;
  param?: string;
  allValue?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function select(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!next || next === allValue) params.delete(param);
    else params.set(param, next);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `?${query}` : window.location.pathname, { scroll: false });
    });
  }

  if (shops.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span className="sr-only">Boutique affichée</span>
      <select
        value={value || allValue}
        onChange={(event) => select(event.target.value)}
        disabled={pending}
        aria-label="Boutique affichée"
        className="focusable rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-night disabled:opacity-60"
      >
        {shops.length > 1 ? <option value={allValue}>{allLabel}</option> : null}
        {shops.map((shop) => (
          <option key={shop.id} value={shop.id}>
            {shop.name}
          </option>
        ))}
      </select>
    </label>
  );
}
