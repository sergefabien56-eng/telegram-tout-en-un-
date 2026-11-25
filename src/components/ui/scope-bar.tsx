import { Store } from "lucide-react";
import Link from "next/link";

/**
 * Bandeau de contexte — « ce que je regarde ».
 *
 * C'est la correction directe du reproche « je change de boutique et les
 * chiffres ne changent pas » : à chaque écran de données, on dit **quelles**
 * boutiques sont concernées et **quelle** période. Le sélecteur de boutique
 * devient donc un élément de l'interface, pas une action invisible.
 */
export function ScopeBar({
  label,
  detail,
  /** Lien « voir toutes les boutiques » quand le périmètre est restreint. */
  allHref,
  allLabel = "Voir toutes les boutiques",
  actions,
}: {
  /** Ex. « MaxiShopsCI » ou « 2 boutiques ». */
  label: string;
  /** Ex. « 12 → 11 nov 2026 · 30 jours ». */
  detail?: string;
  allHref?: string;
  allLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      data-testid="scope-bar"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm"
    >
      <span className="inline-flex items-center gap-2 font-medium text-night">
        <Store className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
        {label}
      </span>
      {detail ? <span className="text-xs text-muted">{detail}</span> : null}
      {allHref ? (
        <Link
          href={allHref}
          className="focusable ml-auto text-xs font-medium text-primary-600 hover:underline"
        >
          {allLabel}
        </Link>
      ) : null}
      {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
