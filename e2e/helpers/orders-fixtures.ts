import { readFileSync, existsSync } from "node:fs";
import { Pool } from "pg";

/**
 * Commandes de test pour le harnais E2E.
 *
 * Les tests tournent sur la base réelle : on y insère des commandes
 * rattachées à une boutique de test (`@exemple.ci`). Elles sont supprimées
 * en cascade avec la boutique lors du nettoyage global de la suite — aucune
 * donnée fictive ne subsiste en production.
 */

function loadEnvLocal() {
  const file = process.env.E2E_ENV_FILE ?? ".env.local";
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export type CommandeTest = {
  externalOrderId: string;
  orderNumber: string;
  status: string;
  totalAmountMinor: number;
  totalItems: number;
  packedItems: number;
  customerCity: string;
  remoteCreatedAt: string;
};

/** Insère des commandes de test dans la boutique indiquée. */
export async function insererCommandes(shopId: string, commandes: CommandeTest[]): Promise<void> {
  loadEnvLocal();
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL absent : impossible de préparer les commandes de test.");
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    for (const commande of commandes) {
      await pool.query(
        `INSERT INTO orders (
           shop_id, external_order_id, order_number, status, country_code, currency,
           total_amount_minor, total_items, packed_items, is_prepayment, has_multiple_status,
           customer_first_name, customer_last_name, customer_city,
           remote_created_at, remote_updated_at
         ) VALUES ($1,$2,$3,$4,'CI','XOF',$5,$6,$7,false,$8,'Test','Client',$9,$10::timestamptz,$10::timestamptz)
         ON CONFLICT (shop_id, external_order_id) DO UPDATE SET status = EXCLUDED.status`,
        [
          shopId,
          commande.externalOrderId,
          commande.orderNumber,
          commande.status,
          commande.totalAmountMinor,
          commande.totalItems,
          commande.packedItems,
          commande.packedItems < commande.totalItems,
          commande.customerCity,
          commande.remoteCreatedAt,
        ],
      );
    }
  } finally {
    await pool.end();
  }
}
