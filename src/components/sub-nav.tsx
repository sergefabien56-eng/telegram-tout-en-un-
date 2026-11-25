"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Fil de sous-rubriques.
 *
 * Chaque rubrique a **sa propre navigation** : on ne renvoie jamais vers une
 * ancre d'une page unique. Le lien actif est marqué `aria-current="page"`.
 */
export type SubNavItem = {
  href: string;
  label: string;
  /** Nombre d'éléments (optionnel) — jamais codé en dur. */
  count?: number | null;
};

export function SubNav({
  items,
  /** Libellé de la rubrique parente, affiché comme contexte. */
  parent,
}: {
  items: SubNavItem[];
  parent?: string;
}) {
  const pathname = usePathname();
  if (items.length === 0) return null;

  return (
    <nav aria-label={parent ? `Sous-rubriques de ${parent}` : "Sous-rubriques"}>
      <ul className="flex flex-wrap gap-2 border-b border-border pb-2">
        {items.map((item) => {
          const actif = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={actif ? "page" : undefined}
                className={`focusable inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                  actif
                    ? "border-primary/40 bg-primary/50 font-medium text-night"
                    : "border-border bg-card text-night hover:bg-surface"
                }`}
              >
                {item.label}
                {typeof item.count === "number" ? (
                  <span className="text-xs text-muted">{item.count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
