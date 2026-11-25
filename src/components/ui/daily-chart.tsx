import { formatMoney } from "@/lib/money";

/**
 * Graphique d'évolution journalière (barres).
 *
 * Principes :
 * - **aucune valeur inventée** : un jour sans commande vaut zéro, la barre
 *   existe et reste vide d'information (hauteur minimale) ;
 * - **accessibilité** : le graphique porte une description textuelle et
 *   chaque barre un titre (valeur + nombre de commandes) ;
 * - **factuel** : l'échelle est le maximum atteint, pas une moyenne.
 */
export type DailyPoint = { period: string; revenueMinor: number; orders: number };

export function DailyChart({
  series,
  currency,
  label,
  height = 160,
}: {
  series: DailyPoint[];
  currency: string;
  label: string;
  height?: number;
}) {
  if (series.length === 0) return null;

  const max = Math.max(...series.map((point) => point.revenueMinor), 0);
  const total = series.reduce((sum, point) => sum + point.revenueMinor, 0);
  const commandes = series.reduce((sum, point) => sum + point.orders, 0);
  const first = series[0]?.period ?? "";
  const last = series[series.length - 1]?.period ?? "";

  return (
    <div>
      <div
        className="flex items-end gap-[2px]"
        style={{ height: `${height}px` }}
        role="img"
        aria-label={`${label} : ${commandes} commande(s), ${formatMoney(total, currency)} du ${first} au ${last}.`}
      >
        {series.map((point) => {
          const ratio = max > 0 ? point.revenueMinor / max : 0;
          const barHeight = point.revenueMinor > 0 ? Math.max(Math.round(ratio * 100), 3) : 1;
          return (
            <div
              key={point.period}
              className="flex-1 rounded-t bg-primary/70"
              style={{ height: `${barHeight}%` }}
              title={`${point.period} — ${formatMoney(point.revenueMinor, currency)} · ${point.orders} commande(s)`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{first}</span>
        <span>
          {commandes} commande(s) · {formatMoney(total, currency)}
        </span>
        <span>{last}</span>
      </div>
    </div>
  );
}
