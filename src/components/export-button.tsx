import { Download } from "lucide-react";

type Props = {
  href: string;
  /** Nombre de lignes réelles incluses, pour un libellé honnête. */
  count?: number | null;
  label?: string;
  /** Toujours afficher (centre des téléchargements), même sans compteur. */
  always?: boolean;
};

/** Lien de téléchargement CSV — absent si aucune donnée, sauf si `always`. */
export function ExportButton({
  href,
  count = null,
  label = "Exporter en CSV",
  always = false,
}: Props) {
  if (!always && (count === 0 || count === null)) return null;

  return (
    <a
      href={href}
      className="focusable inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-night hover:bg-surface"
      download
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {label}
      {count !== null ? <span className="text-xs text-muted">({count})</span> : null}
    </a>
  );
}
