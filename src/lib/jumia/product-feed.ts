import { jumiaGet, jumiaPost, type JumiaAccountScope } from "./request";
import type { ProductCreationInput } from "./catalog-referentiel";

/**
 * Création d'un produit chez Jumia — **asynchrone**.
 *
 * Jumia ne publie pas le produit pendant l'appel : elle renvoie un `feedId`,
 * traite le flux en arrière-plan (`GET /feeds/{id}`) puis contrôle le contenu
 * (QC). On distingue donc cinq états, jamais un « publié » au clic :
 *
 * | État        | Signification                                              |
 * |-------------|------------------------------------------------------------|
 * | `envoyee`   | Jumia a reçu la demande (feed créé)                       |
 * | `en_traitement` | le flux est en cours (PENDING / IN_PROGRESS)            |
 * | `acceptee`  | le flux est terminé sans erreur (COMPLETED, failed = 0)    |
 * | `rejetee`   | le flux a échoué, ou un produit a été refusé               |
 * | `publiee`   | le produit existe au catalogue et son QC est approuvé      |
 */

/* -------------------------------------------------------------------------- */
/* Construction de la charge utile (pure, testable)                           */
/* -------------------------------------------------------------------------- */

export type FeedProduct = {
  name: { value: string };
  description: { value: string };
  parentSku: string;
  sellerSku: string;
  variation: string;
  brand: { code: string; name: string };
  category: { code: string; name: string };
  images: { url: string; primary: boolean }[];
  price: { currency: string; value: number };
  businessClients: { businessClientCode: string; price: { currency: string; value: number } }[];
  stock: number;
  attributes: { name: string; value: string }[];
};

export type CreateFeedPayload = { shopId: string; products: FeedProduct[] };

/**
 * Construit la charge utile de `POST /feeds/products/create`.
 *
 * Deux points où l'API réelle diffère de la documentation :
 * - `brand.code` et `category.code` sont **des chaînes** dans les réponses
 *   de l'API (`GET /catalog/brands`, `GET /catalog/products`) : on les
 *   renvoie telles quelles, sans les convertir en nombre ;
 * - pour un vendeur local, le prix est porté par le **business client**
 *   (`jumia-ci` pour la Côte d'Ivoire) : on l'envoie donc explicitement.
 */
export function buildCreateFeedPayload(input: {
  shopId: string;
  product: ProductCreationInput;
  businessClientCode?: string | null;
}): CreateFeedPayload {
  const { shopId, product } = input;
  const price = { currency: product.currency, value: product.price };
  return {
    shopId,
    products: [
      {
        name: { value: product.name },
        description: { value: product.description },
        // Premier produit d'un ensemble : le SKU vendeur sert de SKU parent.
        parentSku: product.sellerSku,
        sellerSku: product.sellerSku,
        variation: "1",
        brand: { code: product.brandCode, name: product.brandName },
        category: { code: product.categoryCode, name: product.categoryName },
        images: [{ url: product.imageUrl, primary: true }],
        price,
        businessClients: input.businessClientCode
          ? [{ businessClientCode: input.businessClientCode, price }]
          : [],
        stock: product.stock,
        attributes: product.attributes.map((attribute) => ({
          name: attribute.name,
          value: attribute.value,
        })),
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Appels Jumia                                                                */
/* -------------------------------------------------------------------------- */

/** Envoie le flux de création. Jumia répond `201` avec un `feedId`. */
export async function submitProductCreation(
  scope: JumiaAccountScope,
  payload: CreateFeedPayload,
): Promise<{ feedId: string }> {
  const response = await jumiaPost("/feeds/products/create", payload, scope);

  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(readJumiaError(body, response.status));
  }
  const feedId = (body as { feedId?: unknown } | null)?.feedId;
  if (typeof feedId !== "string" || !feedId) {
    throw new Error("Jumia n'a pas renvoyé d'identifiant de flux.");
  }
  return { feedId };
}

/** État d'un flux. */
export type FeedStatus = {
  feedSid: string;
  status: string;
  feedType: string | null;
  total: number;
  completed: number;
  failed: number;
  errorMessage: string | null;
  reportUrl: string | null;
  /** Erreurs détaillées, par produit. */
  items: {
    sellerSku: string | null;
    status: string | null;
    errorMessage: string | null;
    messages: string[];
  }[];
};

/** Lit l'état d'un flux (`GET /feeds/{id}`). */
export async function fetchFeedStatus(
  scope: JumiaAccountScope,
  feedId: string,
): Promise<FeedStatus> {
  const response = await jumiaGet(`/feeds/${encodeURIComponent(feedId)}`, undefined, scope);
  if (!response.ok) {
    throw new Error(`Jumia a refusé la lecture du flux (HTTP ${response.status}).`);
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const items = Array.isArray(body?.feedItems)
    ? (body?.feedItems as Record<string, unknown>[]).map((item) => {
        const errors = item.errors as
          | {
              globalMessages?: unknown;
              businessClients?: { code?: unknown; messages?: unknown };
            }
          | undefined;
        const messages: string[] = [];
        if (Array.isArray(errors?.globalMessages)) {
          for (const message of errors.globalMessages) {
            if (typeof message === "string") messages.push(message);
          }
        }
        const clientMessages = errors?.businessClients?.messages;
        if (Array.isArray(clientMessages)) {
          for (const message of clientMessages) {
            if (typeof message === "string") messages.push(message);
          }
        }
        return {
          sellerSku: typeof item.sellerSKU === "string" ? item.sellerSKU : null,
          status: typeof item.status === "string" ? item.status : null,
          errorMessage: typeof item.errorMessage === "string" ? item.errorMessage : null,
          messages,
        };
      })
    : [];
  return {
    feedSid: typeof body?.feedSid === "string" ? body.feedSid : feedId,
    status: typeof body?.status === "string" ? body.status : "UNKNOWN",
    feedType: typeof body?.feedType === "string" ? body.feedType : null,
    total: Number(body?.total ?? 0),
    completed: Number(body?.completed ?? 0),
    failed: Number(body?.failed ?? 0),
    errorMessage: typeof body?.errorMessage === "string" ? body.errorMessage : null,
    reportUrl: typeof body?.reportUrl === "string" ? body.reportUrl : null,
    items,
  };
}

/* -------------------------------------------------------------------------- */
/* Passage à la publication                                                    */
/* -------------------------------------------------------------------------- */

/** Produit trouvé au catalogue pour un SKU vendeur. */
export type PublishedProduct = {
  id: string | null;
  /** État du contrôle qualité Jumia (« APPROVED », « REJECTED », …). */
  qcStatus: string | null;
  /** Raison de refus éventuelle. */
  rejectionReason: string | null;
  /** Le produit est-il visible et actif sur le business client. */
  active: boolean;
  visible: boolean;
};

/**
 * Cherche un produit par SKU vendeur (`GET /catalog/products?sellerSku=`).
 *
 * C'est la seule façon de savoir si le produit est **réellement publié** :
 * un flux terminé ne signifie pas que le produit est en ligne.
 */
export async function findPublishedProduct(
  scope: JumiaAccountScope,
  sellerSku: string,
): Promise<PublishedProduct | null> {
  const response = await jumiaGet("/catalog/products", { sellerSku, size: 20 }, scope);
  if (!response.ok) {
    throw new Error(`Jumia a refusé la lecture du catalogue (HTTP ${response.status}).`);
  }
  const body = (await response.json().catch(() => null)) as { products?: unknown[] } | null;
  const list = Array.isArray(body?.products) ? body.products : [];
  for (const entry of list) {
    const product = entry as {
      id?: unknown;
      variations?: {
        status?: unknown;
        visible?: unknown;
        businessClients?: {
          qc?: { status?: unknown; rejectionReason?: unknown };
          status?: unknown;
        }[];
      }[];
    };
    const variation = product.variations?.[0];
    const client = variation?.businessClients?.[0];
    const qcStatus =
      typeof client?.qc?.status === "string"
        ? client.qc.status
        : typeof variation?.status === "string"
          ? variation.status
          : null;
    const rejectionReason =
      typeof client?.qc?.rejectionReason === "string" ? client.qc.rejectionReason : null;
    return {
      id: typeof product.id === "string" ? product.id : null,
      qcStatus,
      rejectionReason,
      active: client?.status === "ACTIVE" || variation?.status === "ACTIVE",
      visible: variation?.visible !== false,
    };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Interprétation (pure)                                                       */
/* -------------------------------------------------------------------------- */

/** États présentés à l'utilisateur. */
export type PublicationState = "envoyee" | "en_traitement" | "acceptee" | "rejetee" | "publiee";

/** Libellé et description de chaque état. */
export const PUBLICATION_STATES: Record<
  PublicationState,
  { label: string; detail: string; tone: "muted" | "info" | "success" | "danger" }
> = {
  envoyee: {
    label: "Demande envoyée",
    detail: "Jumia a reçu la demande. Le traitement commence.",
    tone: "info",
  },
  en_traitement: {
    label: "En traitement",
    detail: "Jumia traite la fiche. Le produit n'est pas encore en ligne.",
    tone: "info",
  },
  acceptee: {
    label: "Acceptée",
    detail: "Jumia a accepté la fiche. Le contrôle qualité reste à passer.",
    tone: "info",
  },
  rejetee: {
    label: "Rejetée",
    detail: "Jumia a refusé la fiche. Les motifs sont indiqués ci-dessous.",
    tone: "danger",
  },
  publiee: {
    label: "Publiée",
    detail: "Le produit est en ligne et son contrôle qualité est approuvé.",
    tone: "success",
  },
};

/**
 * Traduit l'état d'un flux en état présenté à l'utilisateur.
 *
 * `published` n'est vrai que si le produit a été **retrouvé au catalogue**
 * avec un contrôle qualité approuvé : c'est la seule preuve de publication.
 */
export function mapPublicationState(input: {
  feedStatus: string | null;
  failed: number;
  errors: string[];
  published?: { qcStatus: string | null; active: boolean; visible: boolean } | null;
}): PublicationState {
  const { feedStatus, failed, errors, published } = input;
  if (published && published.qcStatus === "APPROVED" && published.active && published.visible) {
    return "publiee";
  }
  // Un contrôle qualité « PENDING » n'est pas un refus : la fiche est encore
  // en cours d'examen. Seul un refus effectif est un rejet.
  if (published && published.qcStatus === "REJECTED") return "rejetee";
  if (feedStatus === "FAILED" || failed > 0 || errors.length > 0) return "rejetee";
  if (feedStatus === "COMPLETED") return "acceptee";
  if (feedStatus === "IN_PROGRESS" || feedStatus === "PENDING") return "en_traitement";
  return "envoyee";
}

/** Messages d'erreur lisibles à partir d'une réponse Jumia en échec. */
export function readJumiaError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const row = body as {
      message?: unknown;
      error?: unknown;
      error_description?: unknown;
      errors?: unknown;
    };
    if (typeof row.message === "string" && row.message) return row.message.slice(0, 400);
    if (typeof row.error_description === "string" && row.error_description) {
      return row.error_description.slice(0, 400);
    }
    if (typeof row.error === "string" && row.error) return row.error.slice(0, 400);
    if (Array.isArray(row.errors)) {
      const messages = row.errors
        .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
        .slice(0, 5);
      if (messages.length > 0) return messages.join(" · ").slice(0, 500);
    }
  }
  return `Jumia a refusé la demande (HTTP ${status}).`;
}
