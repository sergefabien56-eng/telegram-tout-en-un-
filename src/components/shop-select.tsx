import type { ScopedShop } from "@/lib/shop-scope";

type Props = {
  shops: ScopedShop[];
  selected?: string;
};

/** Filtre de boutique (une seule à la fois), borné au périmètre autorisé. */
export function ShopSelect({ shops, selected }: Props) {
  if (shops.length <= 1) return null;
  return (
    <form method="get" className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Boutique
        <select
          name="boutique"
          defaultValue={selected ?? ""}
          className="focusable rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
        >
          <option value="">Toutes</option>
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
  );
}

/** En-tête commun des écrans de consultation. */
export function ScopeNotice({ total, allowed }: { total: number; allowed: number }) {
  if (total === 0) {
    return (
      <p className="text-sm text-muted" role="status">
        Aucune boutique accessible. Créez d&apos;abord une boutique, puis rattachez-la à une
        boutique Jumia.
      </p>
    );
  }
  if (allowed === 0) {
    return (
      <p className="text-sm text-danger" role="status">
        Votre rôle ne permet pas d&apos;accéder à cette rubrique sur vos boutiques.
      </p>
    );
  }
  return null;
}
