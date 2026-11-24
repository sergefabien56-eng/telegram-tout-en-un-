import { z } from "zod";

/** Corps de la saisie manuelle du prix d'achat d'un SKU. */
export const purchasePriceSchema = z.object({
  sku: z.string().min(1).max(120),
  /** Unités majeures (FCFA) ; `null` pour effacer. */
  price: z.number().nonnegative().max(1_000_000_000).nullable(),
});
