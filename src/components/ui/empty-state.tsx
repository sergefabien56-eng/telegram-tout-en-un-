import type { ReactNode } from "react";

/**
 * État d'absence de données — jamais un « 0 » trompeur.
 *
 * Règle du projet : une donnée indisponible ne s'affiche pas comme un zéro.
 * Cet état le dit explicitement, et explique la marche à suivre quand elle
 * existe (synchroniser, rattacher, etc.).
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  tone = "neutral",
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  /** `danger` pour un refus de périmètre (ce n'est pas « aucune donnée »). */
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      className={`rounded-xl border border-dashed px-4 py-8 text-center ${
        tone === "danger" ? "border-danger/40 bg-danger/5" : "border-border bg-surface/60"
      }`}
      role={tone === "danger" ? "alert" : "status"}
    >
      {icon ? <div className="mb-2 flex justify-center text-muted">{icon}</div> : null}
      <p className={`text-sm font-medium ${tone === "danger" ? "text-danger" : "text-night"}`}>
        {title}
      </p>
      {description ? (
        <p className="mx-auto mt-1 max-w-prose text-sm text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
