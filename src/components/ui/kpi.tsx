import type { ReactNode } from "react";

/**
 * Indicateur clé — un chiffre, son unité, sa source.
 *
 * Chaque indicateur affiche toujours d'où il vient : sans cette ligne, un
 * chiffre est un chiffre sans contexte, et l'utilisateur ne peut pas savoir
 * s'il est vide, faux ou simplement obsolète.
 */
export function Kpi({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  /** Origine, période, méthode : la ligne qui rend le chiffre traçable. */
  hint?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
  icon?: ReactNode;
}) {
  const tones = {
    default: "text-night",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  } as const;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {icon ? <span className="text-muted">{icon}</span> : null}
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}
