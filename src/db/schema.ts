import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Schéma Phase 1 — voir docs/database.md.
 * Règles : montants entiers + devise, dates UTC (timestamptz), shop_id sur les
 * tables métier, clés externes, unicité par boutique.
 */

// ---------------------------------------------------------------------------
// Auth & utilisateurs
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  locale: text("locale").notNull().default("fr"),
  timezone: text("timezone").notNull().default("Africa/Abidjan"),
  isActive: boolean("is_active").notNull().default(true),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  twoFactorSecretEnc: text("two_factor_secret_enc"),
  /** Empreintes SHA-256 des codes de secours (jamais les codes en clair). */
  twoFactorRecoveryCodes: jsonb("two_factor_recovery_codes").$type<string[]>(),
  twoFactorConfirmedAt: timestamp("two_factor_confirmed_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
  ],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    ip: text("ip").notNull(),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_ip_created_idx").on(t.ip, t.createdAt)],
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const telegramAccounts = pgTable(
  "telegram_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
    username: text("username"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    photoUrl: text("photo_url"),
    linkedUserId: uuid("linked_user_id").references(() => users.id, { onDelete: "set null" }),
    linkCode: text("link_code"),
    linkCodeExpiresAt: timestamp("link_code_expires_at", { withTimezone: true }),
    linkedAt: timestamp("linked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("telegram_accounts_link_code_idx").on(t.linkCode)],
);

export const userNotificationPrefs = pgTable(
  "user_notification_prefs",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(), // 'telegram' | 'web'
    type: text("type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    quietStart: text("quiet_start"),
    quietEnd: text("quiet_end"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.channel, t.type] })],
);

export const accountLinkCodes = pgTable(
  "account_link_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_link_codes_user_idx").on(t.userId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Comptes Jumia (un compte vendeur = un jeu d'identifiants)
// ---------------------------------------------------------------------------

/**
 * Un compte vendeur Jumia (Vendor Center) peut contenir une ou plusieurs
 * boutiques. L'application en gère donc plusieurs, chacun avec ses propres
 * identifiants chiffrés — plus aucune intervention manuelle en base.
 *
 * `refreshTokenCiphertext` est chiffré AES-256-GCM (voir `lib/crypto`) ;
 * le jeton n'est jamais stocké ni affiché en clair.
 */
export const jumiaAccounts = pgTable(
  "jumia_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    email: text("email"),
    clientId: text("client_id").notNull(),
    refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
    /** `active` tant que le refresh token fonctionne, `expired` sinon. */
    status: text("status").notNull().default("active"),
    lastTokenAt: timestamp("last_token_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jumia_accounts_owner_idx").on(t.ownerUserId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Boutiques & permissions
// ---------------------------------------------------------------------------

export const shops = pgTable(
  "shops",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    platform: text("platform").notNull().default("jumia"),
    externalShopId: text("external_shop_id").notNull(),
    country: text("country"),
    currency: text("currency").notNull().default("XOF"),
    /**
     * Rattachement à la plateforme (Phase 2) : identifiant de la boutique distante,
     * nom lu à la source et date du dernier rattachement. `null` = non rattachée.
     */
    remoteShopId: text("remote_shop_id"),
    remoteShopName: text("remote_shop_name"),
    remoteLinkedAt: timestamp("remote_linked_at", { withTimezone: true }),
    /** Compte vendeur Jumia utilisé pour cette boutique (multi-comptes). */
    jumiaAccountId: uuid("jumia_account_id").references(() => jumiaAccounts.id, {
      onDelete: "set null",
    }),
    /** Verrou de synchronisation : une seule synchronisation par boutique. */
    syncInProgress: boolean("sync_in_progress").notNull().default(false),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncStatus: text("last_sync_status"),
    settings: jsonb("settings"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("shops_platform_external_idx").on(t.platform, t.externalShopId),
    // PostgreSQL autorise plusieurs NULL : une boutique distante = une boutique locale.
    uniqueIndex("shops_remote_shop_idx").on(t.remoteShopId),
  ],
);

export const shopMembers = pgTable(
  "shop_members",
  {
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // owner | manager | stock | accountant | assistant
    permissions: jsonb("permissions"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.shopId, t.userId] })],
);

// ---------------------------------------------------------------------------
// Audit, tâches, notifications, réglages
// ---------------------------------------------------------------------------

export const shopInvites = pgTable(
  "shop_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(), // owner | manager | stock | accountant | assistant
    invitedById: uuid("invited_by_id").references(() => users.id, { onDelete: "set null" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shop_invites_shop_idx").on(t.shopId, t.email)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    result: text("result").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_shop_created_idx").on(t.shopId, t.createdAt),
    index("audit_logs_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: text("type").notNull(),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }),
    payload: jsonb("payload"),
    status: text("status").notNull().default("queued"), // queued | running | done | failed
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastError: text("last_error"),
    idempotencyKey: text("idempotency_key"),
    result: jsonb("result"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_status_run_at_idx").on(t.status, t.runAt)],
);

/**
 * INSTANTANÉS DE COHÉRENCE — historique quotidien par boutique.
 *
 * Un contrôle ponctuel dit « tout va bien » aujourd'hui ; c'est la **suite**
 * qui prouve qu'une boutique ne dérive pas. On conserve donc un instantané
 * par jour et par boutique : volumétries source et locale, montants
 * comparés, nombre d'anomalies. Une dérive se voit alors dans le temps.
 */
export const coherenceSnapshots = pgTable(
  "coherence_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    /** Jour UTC de l'instantané (un seul par boutique et par jour). */
    day: text("day").notNull(),
    /** Verdict du contrôle : `coherent` | `ecart` | `indisponible`. */
    status: text("status").notNull(),
    /** Volumétrie locale au moment du contrôle. */
    localProducts: integer("local_products").notNull().default(0),
    localOrders: integer("local_orders").notNull().default(0),
    localStatements: integer("local_statements").notNull().default(0),
    /** Volumétrie renvoyée par Jumia (null si la lecture a échoué). */
    remoteProducts: integer("remote_products"),
    remoteOrders: integer("remote_orders"),
    remoteStatements: integer("remote_statements"),
    /** CA articles comparé (unités mineures) : local et Jumia. */
    revenueMinor: integer("revenue_minor"),
    remoteRevenueMinor: integer("remote_revenue_minor"),
    /** Solde net comparé (unités mineures) : local et Jumia. */
    netMinor: integer("net_minor"),
    remoteNetMinor: integer("remote_net_minor"),
    /** Montant total des commandes comparées (unités mineures). */
    ordersAmountMinor: integer("orders_amount_minor"),
    remoteOrdersAmountMinor: integer("remote_orders_amount_minor"),
    /** Nombre d'anomalies détectées et détail des codes. */
    anomalies: integer("anomalies").notNull().default(0),
    anomalyCodes: jsonb("anomaly_codes"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("coherence_snapshots_shop_day_idx").on(t.shopId, t.day),
    index("coherence_snapshots_shop_checked_idx").on(t.shopId, t.checkedAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("pending"), // pending | sent | failed | grouped
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    /**
     * Clé de déduplication : un même problème ne doit pas être signalé
     * plusieurs fois (le contrôle planifié passe chaque jour, le diagnostic
     * peut être ouvert à la main). `null` = notification sans déduplication.
     *
     * La clé décrit le **problème** (`coherence:<boutique>:<jour>:<code>`) ;
     * c'est l'unicité qui est **par utilisateur** (index composite), car
     * deux gestionnaires d'une même boutique doivent tous les deux être
     * prévenu.
     */
    dedupeKey: text("dedupe_key"),
    /**
     * Canal d'émission : `web` (historique dans l'application) ou
     * `telegram` (message direct). La trace existe pour les deux : on doit
     * pouvoir prouver ce qui a été envoyé, et sur quel canal.
     */
    channel: text("channel").notNull().default("web"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_status_idx").on(t.userId, t.status),
    uniqueIndex("notifications_user_dedupe_key_idx")
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.dedupeKey} IS NOT NULL`),
  ],
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Commandes (Phase 2)
// ---------------------------------------------------------------------------

/**
 * Commande importée depuis une plateforme.
 *
 * R3 : les montants sont stockés en **entiers** (unités mineures, 2 décimales)
 * avec leur devise — jamais de flottant. `raw` conserve la réponse d'origine
 * pour retraiter sans perte si un champ change de forme.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    /** Identifiant de la commande chez la plateforme. */
    externalOrderId: text("external_order_id").notNull(),
    orderNumber: text("order_number"),
    status: text("status").notNull(),
    countryCode: text("country_code"),
    /** Devise du montant local (XOF pour la CI). */
    currency: text("currency").notNull().default("XOF"),
    totalAmountMinor: integer("total_amount_minor").notNull(),
    /** Montant USD renvoyé par Jumia, même représentation entière. */
    totalAmountUsdMinor: integer("total_amount_usd_minor"),
    totalItems: integer("total_items"),
    packedItems: integer("packed_items"),
    isPrepayment: boolean("is_prepayment"),
    hasMultipleStatus: boolean("has_multiple_status"),
    deliveryOption: text("delivery_option"),
    customerFirstName: text("customer_first_name"),
    customerLastName: text("customer_last_name"),
    customerCity: text("customer_city"),
    /** Dates de la plateforme, en UTC (timestamptz). */
    remoteCreatedAt: timestamp("remote_created_at", { withTimezone: true }),
    remoteUpdatedAt: timestamp("remote_updated_at", { withTimezone: true }),
    raw: jsonb("raw"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_shop_external_idx").on(t.shopId, t.externalOrderId),
    index("orders_shop_created_idx").on(t.shopId, t.remoteCreatedAt),
  ],
);

// ---------------------------------------------------------------------------
// Catalogue & stocks (Phase 2)
// ---------------------------------------------------------------------------

/** Ensemble produit (product set) tel que renvoyé par GPM `GET /catalog/products`. */
export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    externalProductId: text("external_product_id").notNull(),
    parentSku: text("parent_sku"),
    name: text("name").notNull(),
    brandName: text("brand_name"),
    categoryCode: text("category_code"),
    categoryName: text("category_name"),
    primaryImage: text("primary_image"),
    /** Statut sur le business client du pays (ACTIVE / INACTIVE / DELETED). */
    status: text("status"),
    qcStatus: text("qc_status"),
    remoteCreatedAt: timestamp("remote_created_at", { withTimezone: true }),
    remoteUpdatedAt: timestamp("remote_updated_at", { withTimezone: true }),
    raw: jsonb("raw"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("products_shop_external_idx").on(t.shopId, t.externalProductId),
    index("products_shop_status_idx").on(t.shopId, t.status),
  ],
);

/** Déclinaison (SKU vendeur) : c'est elle qui porte le prix et le stock. */
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    externalVariantId: text("external_variant_id").notNull(),
    sellerSku: text("seller_sku"),
    barcodeEan: text("barcode_ean"),
    variationName: text("variation_name"),
    currency: text("currency").notNull().default("XOF"),
    priceMinor: integer("price_minor"),
    salePriceMinor: integer("sale_price_minor"),
    status: text("status"),
    visible: boolean("visible"),
    qcStatus: text("qc_status"),
    /** Stock global du SKU (GPM `GET /catalog/stock`). */
    stockGlobal: integer("stock_global"),
    /** Prix d'achat saisi manuellement (entier, unités mineures). Jamais repris de Jumia. */
    purchasePriceMinor: integer("purchase_price_minor"),
    stockUpdatedAt: timestamp("stock_updated_at", { withTimezone: true }),
    raw: jsonb("raw"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("variants_product_external_idx").on(t.productId, t.externalVariantId),
    // Le stock est relu par `sellerSku` : un SKU appartient à une boutique.
    uniqueIndex("variants_shop_sku_idx").on(t.productId, t.sellerSku),
    index("variants_stock_idx").on(t.stockGlobal),
  ],
);

/**
 * PUBLICATIONS DE PRODUITS — suivi des créations envoyées à Jumia.
 *
 * La création d'un produit est **asynchrone** : Jumia renvoie un `feedId`,
 * traite le flux en arrière-plan, puis le produit passe un contrôle qualité.
 * On conserve donc une ligne par envoi, avec l'état réel du flux et les
 * erreurs éventuelles : jamais « publié » au moment du clic.
 */
export const productPublications = pgTable(
  "product_publications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** SKU vendeur : c'est la clé qui relie l'envoi au produit côté Jumia. */
    sellerSku: text("seller_sku").notNull(),
    /** Identifiant du flux Jumia (`feedId`), renseigné après envoi. */
    feedId: text("feed_id"),
    /**
     * État de la demande, tel que présenté à l'utilisateur :
     * `envoyee` (reçue par Jumia) · `en_traitement` · `acceptee` ·
     * `rejetee` · `publiee` (présente au catalogue) · `inconnue`.
     */
    status: text("status").notNull().default("envoyee"),
    /** État brut du flux côté Jumia (PENDING, IN_PROGRESS, COMPLETED, FAILED). */
    feedStatus: text("feed_status"),
    /** Identifiant du produit chez Jumia, une fois la création confirmée. */
    productSid: text("product_sid"),
    /** État du contrôle qualité Jumia sur le produit. */
    qcStatus: text("qc_status"),
    /** Erreurs renvoyées par Jumia (messages globaux et par business client). */
    errors: jsonb("errors"),
    /** Charge utile envoyée : elle est conservée pour rejouer ou expliquer. */
    payload: jsonb("payload").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_publications_shop_idx").on(t.shopId, t.submittedAt),
    index("product_publications_sku_idx").on(t.shopId, t.sellerSku),
  ],
);

/**
 * RÉFÉRENTIEL DES CATÉGORIES JUMIA — copie locale, par boutique.
 *
 * L'API Jumia ne propose **aucun filtre par nom** sur `GET /catalog/categories` :
 * la seule façon de proposer une recherche fiable est de garder le
 * référentiel en local. On y conserve le chemin complet et l'identifiant de
 * l'ensemble d'attributs, qui détermine les champs réellement exigés.
 */
export const jumiaCatalogCategories = pgTable(
  "jumia_catalog_categories",
  {
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    /** Code de la catégorie chez Jumia. */
    code: integer("code").notNull(),
    name: text("name").notNull(),
    /** Chemin complet « Books, Movies and Music / … ». */
    completePath: text("complete_path").notNull(),
    hasChildren: boolean("has_children").notNull().default(false),
    /** Ensemble d'attributs : il porte les champs obligatoires de la catégorie. */
    attributeSetSid: text("attribute_set_sid"),
    attributeSetName: text("attribute_set_name"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.shopId, t.code] }),
    index("jumia_catalog_categories_path_idx").on(t.shopId, t.completePath),
  ],
);

// Type pratique pour l'application.
export type User = typeof users.$inferSelect;
export type Shop = typeof shops.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
// ---------------------------------------------------------------------------
// Finances (Phase 2)
// ---------------------------------------------------------------------------

/** Relevés et versements renvoyés par Jumia (`GET /payout-statement`). */
export const payoutStatements = pgTable(
  "payout_statements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    statementNumber: text("statement_number").notNull(),
    /**
     * Identifiant de boutique renvoyé par Jumia (`shopSid` du relevé).
     * Sert de garde-fou : un relevé portant l'identifiant d'une autre boutique
     * n'est jamais enregistré sous celle-ci.
     */
    remoteShopSid: text("remote_shop_sid"),
    /** Devise des montants de ce relevé. */
    currency: text("currency").notNull().default("XOF"),
    openingBalanceMinor: integer("opening_balance_minor").notNull(),
    itemRevenueMinor: integer("item_revenue_minor").notNull(),
    shipmentFeeMinor: integer("shipment_fee_minor").notNull(),
    feesTotalMinor: integer("fees_total_minor").notNull(),
    otherRevenueMinor: integer("other_revenue_minor").notNull().default(0),
    refundsMinor: integer("refunds_minor").notNull().default(0),
    closingBalanceMinor: integer("closing_balance_minor").notNull(),
    payoutAmountMinor: integer("payout_amount_minor"),
    paid: boolean("paid").notNull().default(false),
    paymentReference: text("payment_reference"),
    /** Date du relevé chez Jumia (timestamptz UTC). */
    remoteCreatedAt: timestamp("remote_created_at", { withTimezone: true }).notNull(),
    remoteUpdatedAt: timestamp("remote_updated_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payout_statements_shop_number_idx").on(t.shopId, t.statementNumber),
    index("payout_statements_shop_created_idx").on(t.shopId, t.remoteCreatedAt),
  ],
);
// ---------------------------------------------------------------------------
// MIMI — assistante IA (Phase 2)
// ---------------------------------------------------------------------------

/** Conversation MIMI d'un utilisateur sur une boutique. */
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_conversations_user_idx").on(t.userId, t.updatedAt)],
);

/** Tour de parole : message utilisateur, réponse ou appel d'outil. */
export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    /** user | assistant | tool */
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** Outil invoqué et ses arguments (journalisation, audit). */
    toolName: text("tool_name"),
    toolArgs: jsonb("tool_args"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

/** Consommation réelle du fournisseur IA (budget 0 FCFA surveillé). */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    toolName: text("tool_name"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt)],
);
