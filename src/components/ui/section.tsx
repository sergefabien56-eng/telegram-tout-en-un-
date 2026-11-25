import type { ReactNode } from "react";

/**
 * Bloc de contenu — carte de section du design system.
 *
 * Tous les écrans découpent leur contenu de la même façon : un titre, une
 * explication courte, une action à droite, puis le contenu. Ce composant
 * factorise ce gabarit : une seule hauteur d'en-tête, une seule typo.
 */
export function Section({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: ReactNode;
  /** Action principale (lien, bouton) alignée à droite du titre. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-night">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0 text-sm">{action}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
