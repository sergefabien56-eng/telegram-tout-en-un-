"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ShopHit = {
  id: string;
  name: string;
  platform: string;
  externalShopId: string;
  status: string;
  role: string;
};

/** Recherche globale (basique) : interroge /api/search,aucune donnée simulée. */
export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShopHit[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        setMessage(null);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const payload = (await response.json()) as {
          ok: boolean;
          data?: { shops: ShopHit[]; message?: string | null };
        };
        if (payload.ok) {
          setResults(payload.data?.shops ?? []);
          setMessage(payload.data?.message ?? null);
          setOpen(true);
        }
      } catch {
        setMessage("Recherche indisponible.");
      } finally {
        setLoading(false);
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
    <div className="relative ml-auto hidden md:block" ref={ref}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Rechercher…"
        aria-label="Recherche globale"
        className="focusable w-56 rounded-lg border border-border bg-surface py-1.5 pl-8 pr-3 text-sm text-night"
      />

      {open ? (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-border bg-card p-3 shadow-lg">
          {loading ? (
            <p className="text-sm text-muted">Recherche…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted">{message ?? "Aucun résultat."}</p>
          ) : (
            <ul className="space-y-1">
              {results.map((shop) => (
                <li key={shop.id}>
                  <Link
                    href="/boutiques"
                    onClick={() => setOpen(false)}
                    className="focusable block rounded-lg px-2 py-1.5 hover:bg-surface"
                  >
                    <p className="text-sm font-medium text-night">{shop.name}</p>
                    <p className="text-xs text-muted">
                      {shop.platform} · rôle {shop.role}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
