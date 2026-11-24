"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ShopHit = { id: string; name: string; role: string };
type ProductHit = {
  productId: string;
  name: string;
  brand: string | null;
  sellerSku: string | null;
  shopName: string;
  stock: number | null;
};

/**
 * « Recherche dans mon espace » : interroge le serveur, qui ne renvoie que des
 * éléments des boutiques autorisées. Aucun résultat ne veut dire « rien ici ».
 */
export function DashboardSearch() {
  const [query, setQuery] = useState("");
  const [shops, setShops] = useState<ShopHit[]>([]);
  const [products, setProducts] = useState<ProductHit[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setShops([]);
        setProducts([]);
        setMessage(null);
        setOpen(false);
        return;
      }
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const payload = (await response.json()) as {
          ok: boolean;
          data?: { shops: ShopHit[]; products: ProductHit[]; message?: string | null };
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
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <label htmlFor="espace-recherche" className="sr-only">
        Rechercher dans mon espace
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <input
          id="espace-recherche"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Boutique, produit, SKU…"
          autoComplete="off"
          className="w-full bg-transparent text-sm text-night outline-none placeholder:text-muted"
        />
      </div>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-full min-w-[18rem] rounded-xl border border-border bg-card p-2 shadow-lg">
          {message ? <p className="px-2 py-1 text-xs text-muted">{message}</p> : null}
          {shops.map((shop) => (
            <Link
              key={`shop-${shop.id}`}
              href="/boutiques"
              onClick={() => setOpen(false)}
              className="focusable flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-night hover:bg-surface"
            >
              <span>{shop.name}</span>
              <span className="text-xs text-muted">Boutique</span>
            </Link>
          ))}
          {products.map((product) => (
            <Link
              key={`product-${product.productId}-${product.sellerSku ?? ""}`}
              href="/produits"
              onClick={() => setOpen(false)}
              className="focusable flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-night hover:bg-surface"
            >
              <span className="min-w-0 truncate">{product.name}</span>
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
