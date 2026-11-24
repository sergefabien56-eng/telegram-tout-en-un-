import { getAccessToken, JUMIA_TOKEN_URL, JumiaError } from "./client";

/** Boutique distante normalisée (GPM `GET /shops`). */
export type RemoteShop = {
  id: string;
  name: string;
  email: string | null;
  /** Pays / clients commerciaux rattachés à la boutique. */
  countries: { code: string; name: string | null; status: string | null }[];
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
      },
    ];
  });
}

/** Liste les boutiques du compte vendeur Jumia (appel Réseau + normalisation). */
export async function listRemoteShops(): Promise<RemoteShop[]> {
  const accessToken = await getAccessToken();

  let response: Response;
  try {
    response = await fetch(`${JUMIA_TOKEN_URL}/shops`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new JumiaError("Jumia injoignable pendant la lecture des boutiques.", "network");
  }

  if (!response.ok) {
    throw new JumiaError(
      `Jumia a refusé la lecture des boutiques (HTTP ${response.status}).`,
      "http_error",
      response.status,
    );
  }

  const body: unknown = await response.json().catch(() => null);
  return listRemoteShopsFromBody(body);
}
