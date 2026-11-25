"use client";

import { Loader2, Search, Store, Package } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ShopHit = { id: string; name: string; role?: string };
type ProductHit = {
  productId: string;
  name: string;
  brand: string | null;
  sellerSku: string | null;
  shopName: string;
  stock: number | null;
};

/**
 * RECHERCHE — un seul composant pour toute l'application.
 *
 * Il existait deux champs de recherche identiques : celui de la barre du haut
 * (boutiques seules) et celui de la rubrique « Recherche dans mon espace »
 * (boutiques + produits). Deux implémentations, deux résultats différents
 * selon l'endroit où l'on cherche : c'est exactement le genre de petite
 * incohérence qui fait « ça ne marche pas ».
 *
 * Ici, une seule requête, un seul rendu, le même partout.
 */
export function SpaceSearch({
  variant = "inline",
  autoFocus = false,
}: {
  /** `inline` : champ pleine largeur (page) ; `compact` : champ d'en-tête. */
  variant?: "inline" | "compact";
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [shops, setShops] = useState<ShopHit[]>([]);
  const [products, setProducts] = useState<ProductHit[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setShops([]);
      setProducts([]);
      setMessage(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const payload = (await response.json()) as {
          ok: boolean;
          data?: {
            shops?: ShopHit[];
            products?: ProductHit[];
            message?: string | null;
          };
        };
        if (!payload.ok) {
          setMessage("Recherche indisponible.");
          setOpen(true);
          return;
        }
        setShops(payload.data?.shops ?? []);
        setProducts(payload.data?.products ?? []);
        setMessage(payload.data?.message ?? null);
        setOpen(true);
      } catch {
        setMessage("Recherche indisponible.");
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      setLoading(false);
    };
  }, [query]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const compact = variant === "compact";

  return (
    <div className="relative" ref={ref}>
      <label htmlFor={compact ? "recherche-entete" : "recherche-espace"} className="sr-only">
        Rechercher dans mon espace
      </label>
      <div
        className={`flex items-center gap-2 rounded-lg border border-border bg-surface px-3 ${
          compact ? "py-1.5" : "py-2.5"
        }`}
      >
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <input
          id={compact ? "recherche-entete" : "recherche-espace"}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
          placeholder={compact ? "Rechercher…" : "Boutique, produit, SKU…"}
          autoComplete="off"
          autoFocus={autoFocus}
          className={`w-full bg-transparent text-sm text-night outline-none placeholder:text-muted ${
            compact ? "max-w-[10rem]" : ""
          }`}
        />
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" aria-hidden="true" />
        ) : null}
      </div>

      {open ? (
        <div
          className={`absolute z-30 mt-2 overflow-hidden rounded-xl border border-border bg-card p-2 shadow-lg ${
            compact ? "right-0 w-80" : "left-0 right-0"
          }`}
        >
          {message ? <p className="px-2 py-2 text-xs text-muted">{message}</p> : null}

          {shops.length > 0 ? (
            <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Boutiques
            </p>
          ) : null}
          {shops.map((shop) => (
            <Link
              key={`shop-${shop.id}`}
              href="/boutiques"
              onClick={() => setOpen(false)}
              className="focusable flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-night hover:bg-surface"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Store className="h-3.5 w-3.5 shrink-0 text-primary-ink" aria-hidden="true" />
                <span className="truncate">{shop.name}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">Boutique</span>
            </Link>
          ))}

          {products.length > 0 ? (
            <p className="px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Produits
            </p>
          ) : null}
          {products.map((product) => (
            <Link
              key={`product-${product.productId}-${product.sellerSku ?? ""}`}
              href="/produits"
              onClick={() => setOpen(false)}
              className="focusable flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-night hover:bg-surface"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Package className="h-3.5 w-3.5 shrink-0 text-primary-ink" aria-hidden="true" />
                <span className="truncate">{product.name}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">
                {product.shopName} · {product.stock ?? "—"}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
