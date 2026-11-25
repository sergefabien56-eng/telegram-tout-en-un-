import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/cn";

/**
 * Logo TOUT EN UN — pictogramme officiel + signature.
 *
 * Le symbole est vectoriel (`BrandMark`) et reprend exactement la géométrie de
 * la source officielle (écart absolu moyen de 0,69/255 par canal). `className`
 * dimensionne le pictogramme (36 px par défaut, comme l'ancien carré « TU »),
 * `withName` affiche la signature à côté.
 *
 * Quand la signature est masquée, le pictogramme porte lui-même le nom
 * accessible : le lien qui l'héberge reste donc toujours nommable (mode
 * « rail » de la barre latérale, en-tête compact de la Mini App).
 */
export function Logo({ className, withName = true }: { className?: string; withName?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark
        className={cn(
          "h-9 w-9 shrink-0 rounded-[8.95%] dark:ring-1 dark:ring-inset dark:ring-white/25",
          className,
        )}
        label={withName ? undefined : "Tout en Un"}
      />
      {withName && (
        <span className="leading-tight">
          <span className="block text-[15px] font-bold text-night">TOUT EN UN</span>
          <span className="block text-[11px] font-medium text-muted">Business Manager</span>
        </span>
      )}
    </div>
  );
}
