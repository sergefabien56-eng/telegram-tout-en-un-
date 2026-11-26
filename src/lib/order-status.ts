/**
 * Classification des commandes — source unique de vérité.
 *
 * Les définitions ci-dessous sont **celles de la documentation du projet**
 * (`docs/plan-refonte-ventes-commandes.md`) : elles sont partagées par les
 * pages, les exports et les tests. Toute divergence entre l'interface et
 * ces définitions serait un bug.
 *
 * Principe : on ne classe **jamais** une commande « prête à expédier » si
 * sa préparation n'est pas confirmée, et on ne confond jamais un échec de
 * livraison avec une annulation.
 */

/** Normalise un statut Jumia : « Ready to ship » → «readytoship ». */
export function normalizeOrderStatus(status: string): string {
  return status
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

/** Familles de commandes utilisées par l'interface. */
export type OrderFamily =
  | "en-attente"
  | "pretes-a-expedier"
  | "expediees"
  | "livrees"
  | "annulees"
  | "echec-livraison"
  | "retours"
  /**
   * Famille d'**historique** : toutes les commandes sauf les annulées,
   * qui ont leur propre sous-vue. Elle n'est utilisée qu'en SQL (vue), pas
   * comme résultat de `orderFamily`.
   */
  | "hors-annulees";

/** Libellé lisible d'un statut brut Jumia. */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  CREATED: "Créée",
  PENDING: "En attente",
  PROCESSING: "En préparation",
  NEW: "Nouvelle",
  READY_TO_SHIP: "Prête à expédier",
  READYTOSHIP: "Prête à expédier",
  SHIPPED: "Expédiée",
  PICKEDUP: "Expédiée (collectée)",
  DELIVERED: "Livrée",
  CANCELED: "Annulée",
  CANCELLED: "Annulée",
  FAILED: "Échec de livraison",
  RETURNED: "Retournée",
  REFUNDED: "Remboursée",
  RETURNREQUESTED: "Retour demandé",
  RMA: "Retour (RMA)",
  RETURNWAITINGFORAPPROVAL: "Retour en attente d'accord",
  MULTIPLESTATUS: "Statuts multiples",
};

/** Statuts dont la préparation n'est pas confirmée. */
export const STATUS_EN_ATTENTE = ["pending", "created", "new", "processing"];

/** Statuts dont l'expédition est confirmée. */
export const STATUS_EXPEDIEES = ["shipped", "pickedup"];

/** Statuts de fin de transaction. */
export const STATUS_LIVREES = ["delivered"];

/** Commandes annulées (≠ échec de livraison). */
export const STATUS_ANNULEES = ["canceled", "cancelled"];

/** Échec de livraison : distinct d'une annulation. */
export const STATUS_ECHEC_LIVRAISON = ["failed"];

/** Tous les retours, quel que soit le motif. */
export const STATUS_RETOURS = [
  "returned",
  "refunded",
  "returnrequested",
  "returnwaitingforapproval",
  "rma",
];

/**
 * Statuts qui ne relèvent **ni** de « en attente » **ni** de « prêtes à
 * expédier » : livrées, annulées, en échec ou retournées.
 *
 * Ces listes sont aussi traduites en SQL (`orders.ts`) : les deux
 * implémentations doivent rester d'accord, ce que vérifie un test.
 */
export const STATUS_HORS_ATTENTE = [
  ...STATUS_ANNULEES,
  ...STATUS_ECHEC_LIVRAISON,
  ...STATUS_RETOURS,
  ...STATUS_LIVREES,
  ...STATUS_EXPEDIEES,
];

/**
 * Statuts d'**article** qui signifient : cet article demande encore une
 * action au vendeur.
 *
 * Le statut agrégé d'une commande ne suffit pas toujours. Pour une commande
 * « Multiple Status », Jumia renvoie un statut global qui ne dit rien de ce
 * qu'il reste à faire, et le compteur `packedItems` compte les articles
 * emballés — y compris ceux qui ont ensuite été annulés ou livrés. Seuls les
 * statuts d'articles disent ce qui est encore dû.
 */
export const ITEM_STATUS_A_TRAITER = [
  "pending",
  "created",
  "new",
  "processing",
  "readytoship",
];

/** Statuts d'article qui signifient : l'article est prêt à partir. */
export const ITEM_STATUS_PRET = ["readytoship"];

export type OrderStatusInput = {
  status: string;
  /** Nombre d'articles préparés (champ Jumia `packedItems`). */
  packedItems?: number | null;
  /** Nombre total d'articles (champ Jumia `totalItems`). */
  totalItems?: number | null;
  /**
   * Statuts des articles de la commande, quand ils sont connus.
   *
   * Ils ne sont nécessaires que pour les commandes dont le statut agrégé
   * n'est pas un statut terminal connu (« Multiple Status »).
   */
  itemStatuses?: readonly string[] | null;
};

/**
 * Préparation confirmée ?
 *
 * Deux signaux concordants :
 * - le statut Jumia dit que la commande est prête ;
 * - tous les articles sont emballés (`packedItems ≥ totalItems > 0`).
 *
 * Une commande à statuts multiples (`packed < total`) n'est **jamais**
 * considérée comme prête : sa préparation est partielle.
 */
export function isPreparationConfirmed(order: OrderStatusInput): boolean {
  const normalized = normalizeOrderStatus(order.status);
  if (order.totalItems !== null && order.totalItems !== undefined && order.totalItems > 0) {
    const packed = order.packedItems ?? 0;
    if (packed < order.totalItems) return false;
    if (packed > 0) return true;
  }
  return normalized === "readytoship";
}

/** Préparation partielle : certains articles sont prêts, d'autres non. */
export function isPartiallyPacked(order: OrderStatusInput): boolean {
  const total = order.totalItems ?? 0;
  const packed = order.packedItems ?? 0;
  return total > 0 && packed > 0 && packed < total;
}

/**
 * Famille déduite des statuts d'articles.
 *
 * C'est le seul niveau qui dise ce qu'il **reste** à faire : le statut
 * agrégé d'une commande « Multiple Status » masque la situation réelle, et
 * `packedItems` compte les articles emballés, même ceux qui ont ensuite été
 * annulés ou livrés.
 *
 * Cas réel (MaxiShopsCI, commande 325542321) : un article annulé et un
 * article livré. La commande n'a plus rien à préparer : elle ne doit pas
 * apparaître dans « À traiter ».
 *
 * `null` = aucune conclusion possible (aucun article connu, ou statuts
 * d'articles tous inconnus) : l'appelant conserve alors son comportement
 * par défaut.
 */
export function familyFromItemStatuses(
  statuses: readonly string[] | null | undefined,
): OrderFamily | null {
  if (!statuses || statuses.length === 0) return null;
  const normalises = statuses.map(normalizeOrderStatus);

  // Des articles restent à traiter : la commande est à traiter, elle aussi.
  const aTraiter = normalises.filter((statut) => ITEM_STATUS_A_TRAITER.includes(statut));
  if (aTraiter.length > 0) {
    // Tous les articles restants sont prêts à partir : plus rien à emballer.
    return aTraiter.every((statut) => ITEM_STATUS_PRET.includes(statut))
      ? "pretes-a-expedier"
      : "en-attente";
  }

  // Plus aucun article à traiter : la commande est close. Elle est classée
  // d'après l'article le plus avancé, l'ordre ci-dessous étant celui de
  // l'avancement réel d'un colis.
  if (normalises.some((statut) => STATUS_LIVREES.includes(statut))) return "livrees";
  if (normalises.some((statut) => STATUS_EXPEDIEES.includes(statut))) return "expediees";
  if (normalises.some((statut) => STATUS_ECHEC_LIVRAISON.includes(statut))) {
    return "echec-livraison";
  }
  if (normalises.some((statut) => STATUS_RETOURS.includes(statut))) return "retours";
  if (normalises.some((statut) => STATUS_ANNULEES.includes(statut))) return "annulees";

  // Statuts d'articles inconnus : aucune conclusion.
  return null;
}

/**
 * Famille d'une commande, selon les définitions du projet.
 *
 * L'ordre de test est important : une commande livrée ou annulée n'est
 * jamais « en attente », même si ses statuts preparationnels y ressemblent.
 */
export function orderFamily(order: OrderStatusInput): OrderFamily {
  const normalized = normalizeOrderStatus(order.status);
  if (STATUS_ANNULEES.includes(normalized)) return "annulees";
  if (STATUS_ECHEC_LIVRAISON.includes(normalized)) return "echec-livraison";
  if (STATUS_RETOURS.includes(normalized)) return "retours";
  if (STATUS_LIVREES.includes(normalized)) return "livrees";
  if (STATUS_EXPEDIEES.includes(normalized)) return "expediees";
  if (STATUS_EN_ATTENTE.includes(normalized)) {
    return isPreparationConfirmed(order) ? "pretes-a-expedier" : "en-attente";
  }
  if (normalized === "readytoship") return "pretes-a-expedier";
  // Statut inconnu (ex. « Multiple Status ») : la décision revient aux
  // articles, seul niveau qui dise ce qu'il reste à faire. Sans information
  // sur les articles, on reste prudent (jamais « prête à expédier »).
  const parArticles = familyFromItemStatuses(order.itemStatuses);
  if (parArticles) return parArticles;
  return isPreparationConfirmed(order) ? "pretes-a-expedier" : "en-attente";
}

/** Une commande multi-statuts doit le signaler à l'utilisateur. */
export function hasMultipleStatuses(order: OrderStatusInput): boolean {
  return normalizeOrderStatus(order.status) === "multiplestatus" || isPartiallyPacked(order);
}

/** Libellé lisible d'un statut. */
export function orderStatusLabel(status: string): string {
  const raw = status
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (ORDER_STATUS_LABELS[raw]) return ORDER_STATUS_LABELS[raw];
  const compact = normalizeOrderStatus(status).toUpperCase();
  return ORDER_STATUS_LABELS[compact] ?? status;
}

/** Statuts proposés dans le filtre « Statut » (valeurs réellement observées). */
export const ORDER_STATUS_OPTIONS = [
  { value: "PENDING", label: "En attente" },
  { value: "READY_TO_SHIP", label: "Prête à expédier" },
  { value: "SHIPPED", label: "Expédiée" },
  { value: "DELIVERED", label: "Livrée" },
  { value: "CANCELED", label: "Annulée" },
  { value: "FAILED", label: "Échec de livraison" },
  { value: "RETURNED", label: "Retournée" },
  { value: "REFUNDED", label: "Remboursée" },
  { value: "Multiple Status", label: "Statuts multiples" },
];
