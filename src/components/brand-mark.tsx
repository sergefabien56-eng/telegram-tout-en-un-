import { BRAND_LOGO, BRAND_LOGO_SQUARES } from "@/lib/brand-logo";
import { cn } from "@/lib/cn";

/**
 * Pictogramme officiel « Tout en Un » — vectoriel, sans dépendance externe.
 *
 * La géométrie provient de `src/lib/brand-logo.json`, source de vérité
 * partagée avec `src/app/icon.svg` (voir `scripts/generate-brand-assets.mjs`).
 * Le rendu est identique à la source officielle : écart absolu moyen de
 * 0,69/255 par canal.
 *
 * Le pictogramme est décoratif par défaut. `label` lui donne un nom
 * accessible quand il est le seul élément de marque à l'écran.
 */
export function BrandMark({ className, label }: { className?: string; label?: string }) {
  const { colors, tile, center, arms } = BRAND_LOGO;

  return (
    <svg
      viewBox={BRAND_LOGO.viewBox}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("block", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <rect width={tile.width} height={tile.height} rx={tile.radius} fill={colors.navy} />
      <g fill="none" strokeLinecap="butt">
        {arms.lines.map((line) => (
          <line
            key={`${line.x1}-${line.y1}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={colors.teal}
            strokeWidth={arms.width}
          />
        ))}
      </g>
      <g>
        {BRAND_LOGO_SQUARES.map((square) => (
          <rect
            key={`${square.x}-${square.y}`}
            x={square.x}
            y={square.y}
            width={square.width}
            height={square.height}
            fill={colors.light}
          />
        ))}
      </g>
      <rect
        x={center.x}
        y={center.y}
        width={center.width}
        height={center.height}
        fill={colors.teal}
      />
    </svg>
  );
}
