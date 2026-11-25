import type { ReactNode } from "react";

/**
 * En-tête de page — une seule signature pour tous les écrans.
 *
 * Avant, chaque page réécrivait son titre, sa description et son action : six
 * variantes du même bloc, six hauteurs différentes. Le contenu de la page
 * commence donc toujours au même endroit.
 */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Contenu sous l'en-tête (filtres, contexte, bandeau). */
  children?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-night">{title}</h1>
          {description ? <div className="mt-1 text-sm text-muted">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
