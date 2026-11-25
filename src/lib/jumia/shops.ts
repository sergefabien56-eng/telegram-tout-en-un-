import { JumiaError } from "./client";
import { jumiaGet, type JumiaAccountScope } from "./request";

/** Boutique distante normalisée (GPM `GET /shops`). */
export type RemoteShop = {
  id: string;
  name: string;
  email: string | null;
  /** Pays / clients commerciaux rattachés à la boutique. */
  countries: { code: string; name: string | null; status: string | null }[];
  /**
   * Clients commerciaux (ex. « jumia-ci »). C'est le code qui porte le prix
   * local chez Jumia : il est nécessaire pour créer un produit.
   */
  businessClients: { code: string; name: string | null; countryCode: string | null }[];
};

/**
 * Normalise le corps de `GET /shops`.
 *
 * La documentation GPM décrit un tableau brut ; on accepte aussi `{shops: []}`
 * par prudence et on ignore les entrées incomplètes plutôt que de faire échouer tout
 * l'écran pour une boutique malformée.
 */
export function listRemoteShopsFromBody(body: unknown): RemoteShop[] {
  const list: unknown[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { shops?: unknown[] })?.shops)
      ? ((body as { shops: unknown[] }).shops ?? [])
      : [];

  return list.flatMap((entry): RemoteShop[] => {
    const shop = entry as {
      id?: unknown;
      name?: unknown;
      email?: unknown;
      businessClients?: unknown;
    };
    if (typeof shop.id !== "string" || typeof shop.name !== "string") return [];
    const clients = Array.isArray(shop.businessClients) ? shop.businessClients : [];
    return [
      {
        id: shop.id,
        name: shop.name,
        email: typeof shop.email === "string" ? shop.email : null,
        countries: clients.flatMap((client): RemoteShop["countries"] => {
          const row = client as { countryCode?: unknown; name?: unknown; status?: unknown };
          if (typeof row.countryCode !== "string") return [];
          return [
            {
              code: row.countryCode,
              name: typeof row.name === "string" ? row.name : null,
              status: typeof row.status === "string" ? row.status : null,
            },
          ];
        }),
        businessClients: clients.flatMap((client): RemoteShop["businessClients"] => {
          const row = client as { code?: unknown; name?: unknown; countryCode?: unknown };
          if (typeof row.code !== "string" || !row.code) return [];
          return [
            {
              code: row.code,
              name: typeof row.name === "string" ? row.name : null,
              countryCode: typeof row.countryCode === "string" ? row.countryCode : null,
            },
          ];
        }),
      },
    ];
  });
}

/**
 * Liste les boutiques d'un compte vendeur Jumia.
 *
 * Deux endpoints officiels sont lus et fusionnés, car un master-shop peut
 * associer des boutiques qui n'apparaissent pas dans `/shops` :
 * - `GET /shops` : boutiques du compte ;
 * - `GET /shops-of-master-shop` : boutiques du compte **et** du master-shop.
 *
 * Sans `scope` explicite, on utilise l'identifiant historique (repli).
 */
export async function listRemoteShops(scope?: JumiaAccountScope): Promise<RemoteShop[]> {
  const paths = ["/shops", "/shops-of-master-shop"];
  const merged = new Map<string, RemoteShop>();

  for (const path of paths) {
    let response: Response;
    try {
      response = await jumiaGet(path, undefined, scope);
    } catch (error) {
      // Le second endpoint peut être indisponible sur certains comptes :
      // on ne bloque que si le premier a déjà échoué.
      if (merged.size === 0 && path === paths[0]) throw error;
      continue;
    }
    if (!response.ok) {
      if (merged.size === 0 && path === paths[0]) {
        throw new JumiaError(
          `Jumia a refusé la lecture des boutiques (HTTP ${response.status}).`,
          "http_error",
          response.status,
        );
      }
      continue;
    }
    const body: unknown = await response.json().catch(() => null);
    for (const shop of listRemoteShopsFromBody(body)) {
      const existing = merged.get(shop.id);
      if (!existing) {
        merged.set(shop.id, shop);
        continue;
      }
      // Fusion des clients commerciaux (un appel peut en apporter d'autres).
      const countries = new Map(existing.countries.map((row) => [row.code, row]));
      for (const row of shop.countries) countries.set(row.code, row);
      const businessClients = new Map(existing.businessClients.map((row) => [row.code, row]));
      for (const row of shop.businessClients) businessClients.set(row.code, row);
      merged.set(shop.id, {
        ...existing,
        email: existing.email ?? shop.email,
        countries: Array.from(countries.values()),
        businessClients: Array.from(businessClients.values()),
      });
    }
  }

  if (merged.size === 0) {
    throw new JumiaError("Aucune boutique Jumia n'est accessible avec ce compte.", "no_shop");
  }
  return Array.from(merged.values());
}
