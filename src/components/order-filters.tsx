"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef } from "react";

type ShopOption = { id: string; name: string };

type Props = {
  shops: ShopOption[];
  values: { boutique?: string; du?: string; au?: string; statut?: string };
};

const STATUTS = ["CREATED", "PENDING", "SHIPPED", "DELIVERED", "CANCELED", "RETURNED", "REFUNDED"];

/**
 * Filtres de consultation : boutique, période, statut. Formulaire GET, donc
 * l'état reste dans l'URL (partageable, retour navigateur fonctionnel).
 */
export function OrderFilters({ shops, values }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);

  /**
   * Changer de boutique applique le filtre immédiatement, en conservant la
   * période et le statut déjà choisis : le vendeur voit tout de suite les
   * données de la boutique qu'il vient de sélectionner.
   */
  function applyShop(value: string) {
    const form = formRef.current;
    if (!form) return;
    const params = new URLSearchParams();
    for (const [key, raw] of new FormData(form).entries()) {
      const entry = String(raw);
      if (!entry) continue;
      params.set(key, entry);
    }
    if (!value) params.delete("boutique");
    else params.set("boutique", value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <form ref={formRef} method="get" className="mt-4 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Boutique
        <select
          name="boutique"
          defaultValue={values.boutique ?? ""}
          onChange={(event) => applyShop(event.target.value)}
          className="focusable rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
        >
          <option value="">Toutes les boutiques ({shops.length})</option>
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Du
        <input
          type="date"
          name="du"
          defaultValue={values.du}
          className="focusable rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Au
        <input
          type="date"
          name="au"
          defaultValue={values.au}
          className="focusable rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Statut
        <select
          name="statut"
          defaultValue={values.statut ?? ""}
          className="focusable rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
        >
          <option value="">Tous les statuts</option>
          {STATUTS.map((statut) => (
            <option key={statut} value={statut}>
              {statut}
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
  );
}
