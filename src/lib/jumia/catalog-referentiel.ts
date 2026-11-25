import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { jumiaGet, type JumiaAccountScope } from "./request";

/**
 * Référentiel du catalogue Jumia (GPM).
 *
 * Trois lectures, toutes **réelles** :
 * - `GET /catalog/categories` : l'arborescence des catégories, avec le chemin
 *   complet et l'ensemble d'attributs qui détermine les champs obligatoires ;
 * - `GET /catalog/attribute-sets/{id}` : les attributs d'un ensemble, avec
 *   `mandatory` et les valeurs autorisées ;
 * - `GET /catalog/brands` : les marques (un produit sans marque n'est pas
 *   accepté par Jumia).
 *
 * L'API ne propose **aucun filtre par nom** sur les catégories : la recherche
 * se fait donc sur la copie locale, alimentée par `refreshCategoryCatalog`.
 */

/* -------------------------------------------------------------------------- */
/* Normalisation (pure, testable)                                             */
/* -------------------------------------------------------------------------- */

export type JumiaCategory = {
  code: number;
  name: string;
  completePath: string;
  hasChildren: boolean;
  attributeSetSid: string | null;
  attributeSetName: string | null;
};

export type JumiaAttribute = {
  sid: string;
  code: number | null;
  name: string;
  description: string | null;
  /** Type Jumia (nombre) : 1 texte, 2 nombre, 3 booléen, 4 liste… */
  type: number | null;
  /** Champ **obligatoire** pour la catégorie : c'est Jumia qui le décide. */
  mandatory: boolean;
  /** Attribut de variation (taille, couleur…). */
  variation: boolean;
  options: { name: string; default: boolean }[];
};

/** Extrait les catégories d'un corps de réponse (tableau ou `{categories:[]}`). */
export function parseCategories(body: unknown): JumiaCategory[] {
  const list = Array.isArray(body)
    ? body
    : Array.isArray((body as { categories?: unknown[] })?.categories)
      ? ((body as { categories: unknown[] }).categories ?? [])
      : [];
  const out: JumiaCategory[] = [];
  for (const entry of list) {
    const row = entry as {
      code?: unknown;
      name?: unknown;
      completePath?: unknown;
      hasChildren?: unknown;
      attributeSet?: { sid?: unknown; name?: unknown };
    };
    const code = Number(row.code);
    if (!Number.isFinite(code) || typeof row.name !== "string") continue;
    out.push({
      code,
      name: row.name,
      completePath: typeof row.completePath === "string" ? row.completePath : row.name,
      hasChildren: row.hasChildren === true,
      attributeSetSid: typeof row.attributeSet?.sid === "string" ? row.attributeSet.sid : null,
      attributeSetName: typeof row.attributeSet?.name === "string" ? row.attributeSet.name : null,
    });
  }
  return out;
}

/** Extrait les attributs d'un ensemble (`{attributes:[…]}`). */
export function parseAttributeSet(body: unknown): JumiaAttribute[] {
  const list = Array.isArray((body as { attributes?: unknown[] })?.attributes)
    ? ((body as { attributes: unknown[] }).attributes ?? [])
    : [];
  const out: JumiaAttribute[] = [];
  for (const entry of list) {
    const row = entry as {
      sid?: unknown;
      code?: unknown;
      name?: unknown;
      description?: unknown;
      type?: unknown;
      mandatory?: unknown;
      variation?: unknown;
      options?: unknown;
    };
    if (typeof row.name !== "string" || !row.name) continue;
    const options = Array.isArray(row.options)
      ? row.options.flatMap((option) => {
          const value = option as { name?: unknown; default?: unknown };
          if (typeof value.name !== "string") return [];
          return [{ name: value.name, default: value.default === true }];
        })
      : [];
    out.push({
      sid: typeof row.sid === "string" ? row.sid : "",
      code: Number.isFinite(Number(row.code)) ? Number(row.code) : null,
      name: row.name,
      description: typeof row.description === "string" ? row.description : null,
      type: Number.isFinite(Number(row.type)) ? Number(row.type) : null,
      mandatory: row.mandatory === true,
      variation: row.variation === true,
      options,
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Lectures Jumia                                                             */
/* -------------------------------------------------------------------------- */

/** Une page de catégories. */
export async function fetchCategoryPage(
  scope: JumiaAccountScope,
  page: number,
  size = 100,
): Promise<{ categories: JumiaCategory[]; current: number; totalOfPages: number }> {
  const response = await jumiaGet("/catalog/categories", { page, size }, scope);
  if (!response.ok) {
    throw new Error(`Jumia a refusé la lecture des catégories (HTTP ${response.status}).`);
  }
  const body = (await response.json().catch(() => null)) as {
    page?: { current?: number; totalOfPages?: number };
  } | null;
  return {
    categories: parseCategories(body),
    current: Number(body?.page?.current ?? page),
    totalOfPages: Number(body?.page?.totalOfPages ?? 0),
  };
}

/** Un ensemble d'attributs (les champs exigés par une catégorie). */
export async function fetchAttributeSet(
  scope: JumiaAccountScope,
  sid: string,
): Promise<JumiaAttribute[]> {
  const response = await jumiaGet(
    `/catalog/attribute-sets/${encodeURIComponent(sid)}`,
    undefined,
    scope,
  );
  if (!response.ok) {
    throw new Error(`Jumia a refusé la lecture des attributs (HTTP ${response.status}).`);
  }
  return parseAttributeSet(await response.json().catch(() => null));
}

/** Une page de marques. */
export async function fetchBrandPage(
  scope: JumiaAccountScope,
  page = 1,
  size = 100,
): Promise<{ code: number; name: string }[]> {
  const response = await jumiaGet("/catalog/brands", { page, size }, scope);
  if (!response.ok) {
    throw new Error(`Jumia a refusé la lecture des marques (HTTP ${response.status}).`);
  }
  const body = (await response.json().catch(() => null)) as { brands?: unknown[] } | null;
  const list = Array.isArray(body?.brands) ? body.brands : [];
  return list.flatMap((entry) => {
    const row = entry as { code?: unknown; name?: unknown };
    const code = Number(row.code);
    if (!Number.isFinite(code) || typeof row.name !== "string") return [];
    return [{ code, name: row.name }];
  });
}

/* -------------------------------------------------------------------------- */
/* Cache local                                                                */
/* -------------------------------------------------------------------------- */

/** État du dernier chargement du référentiel, par boutique. */
export type CatalogSyncState = {
  /** Le référentiel a été chargé jusqu'au bout. */
  complete: boolean;
  /** Nombre de catégories enregistrées. */
  count: number;
  /** Pages parcourues. */
  pages: number;
  /** Pages annoncées par Jumia. */
  totalOfPages: number;
  /** Date du dernier chargement (ISO). */
  lastSyncAt: string | null;
};

const SYNC_KEY_PREFIX = "jumia_catalog_sync:";

/** État neutre : rien n'a encore été chargé. */
export function emptyCatalogSyncState(): CatalogSyncState {
  return { complete: false, count: 0, pages: 0, totalOfPages: 0, lastSyncAt: null };
}

/**
 * Lit un état de chargement stocké en `jsonb`.
 *
 * La colonne `app_settings.value` est un `jsonb` : PostgreSQL la rend
 * **déjà décodeée** (un objet), et non comme la chaîne JSON qu'on y avait
 * écrite. On accepte donc les deux formes — sans cela, l'état était
 * systématiquement perdu à la relecture et le chargement complet était
 * affiché comme « en cours » pour l'éternité.
 */
export function parseCatalogSyncState(raw: unknown): CatalogSyncState {
  let value: unknown = raw;
  if (typeof value === "string") {
    if (!value) return emptyCatalogSyncState();
    try {
      value = JSON.parse(value);
    } catch {
      return emptyCatalogSyncState();
    }
  }
  if (!value || typeof value !== "object") return emptyCatalogSyncState();
  const parsed = value as Partial<CatalogSyncState>;
  return {
    complete: parsed.complete === true,
    count: Number(parsed.count ?? 0),
    pages: Number(parsed.pages ?? 0),
    totalOfPages: Number(parsed.totalOfPages ?? 0),
    lastSyncAt: typeof parsed.lastSyncAt === "string" ? parsed.lastSyncAt : null,
  };
}

/** Registre d'état du chargement (dans `app_settings`, scopé par boutique). */
export async function readCatalogSyncState(shopId: string): Promise<CatalogSyncState> {
  const rows = await getDb()
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, `${SYNC_KEY_PREFIX}${shopId}`))
    .limit(1);
  return parseCatalogSyncState(rows[0]?.value);
}

/** Écrit l'état du chargement. */
export async function writeCatalogSyncState(
  shopId: string,
  state: CatalogSyncState,
): Promise<void> {
  await getDb()
    .insert(schema.appSettings)
    .values({ key: `${SYNC_KEY_PREFIX}${shopId}`, value: JSON.stringify(state) })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: JSON.stringify(state), updatedAt: new Date() },
    });
}

/** Enregistre une page de catégories. */
export async function saveCategories(shopId: string, categories: JumiaCategory[]): Promise<void> {
  if (categories.length === 0) return;
  const rows = categories.map((category) => ({
    shopId,
    code: category.code,
    name: category.name,
    completePath: category.completePath,
    hasChildren: category.hasChildren,
    attributeSetSid: category.attributeSetSid,
    attributeSetName: category.attributeSetName,
    syncedAt: new Date(),
  }));
  await getDb()
    .insert(schema.jumiaCatalogCategories)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.jumiaCatalogCategories.shopId, schema.jumiaCatalogCategories.code],
      set: {
        name: sql`excluded.name`,
        completePath: sql`excluded.complete_path`,
        hasChildren: sql`excluded.has_children`,
        attributeSetSid: sql`excluded.attribute_set_sid`,
        attributeSetName: sql`excluded.attribute_set_name`,
        syncedAt: new Date(),
      },
    });
}

/** Recherche de catégories dans la copie locale. */
export async function searchLocalCategories(
  shopId: string,
  query: string,
  limit = 40,
): Promise<JumiaCategory[]> {
  const rows = await getDb()
    .select()
    .from(schema.jumiaCatalogCategories)
    .where(
      query
        ? sql`${schema.jumiaCatalogCategories.shopId} = ${shopId} and (${schema.jumiaCatalogCategories.name} ilike ${`%${query}%`} or ${schema.jumiaCatalogCategories.completePath} ilike ${`%${query}%`})`
        : sql`${schema.jumiaCatalogCategories.shopId} = ${shopId}`,
    )
    .limit(limit);
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    completePath: row.completePath,
    hasChildren: row.hasChildren,
    attributeSetSid: row.attributeSetSid,
    attributeSetName: row.attributeSetName,
  }));
}

/** Nombre de catégories enregistrées pour une boutique. */
export async function countLocalCategories(shopId: string): Promise<number> {
  const rows = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.jumiaCatalogCategories)
    .where(eq(schema.jumiaCatalogCategories.shopId, shopId));
  return Number(rows[0]?.total ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Validation des attributs                                                    */
/* -------------------------------------------------------------------------- */

/** Champ de la fiche, tel que saisi par l'utilisateur. */
export type ProductAttributeInput = { name: string; value: string };

/**
 * Vérifie la fiche contre les attributs **réellement exigés** par Jumia pour
 * la catégorie choisie.
 *
 * On ne suppose pas qu'une liste unique convient à tous les produits : seuls
 * les attributs `mandatory` de l'ensemble d'attributs de la catégorie sont
 * exigés. Les autres sont signalés comme « recommandés » s'ils ont une
 * liste de valeurs autorisées.
 */
export function validateAgainstAttributeSet(input: {
  attributes: JumiaAttribute[];
  values: ProductAttributeInput[];
}): {
  missing: JumiaAttribute[];
  invalid: { attribute: JumiaAttribute; value: string; reason: string }[];
  optionalWithOptions: JumiaAttribute[];
} {
  const parNom = new Map(input.values.map((row) => [row.name.trim(), row.value.trim()]));
  const missing: JumiaAttribute[] = [];
  const invalid: { attribute: JumiaAttribute; value: string; reason: string }[] = [];
  const optionalWithOptions: JumiaAttribute[] = [];

  for (const attribute of input.attributes) {
    const value = parNom.get(attribute.name) ?? "";
    if (!value) {
      if (attribute.mandatory) missing.push(attribute);
      else if (attribute.options.length > 0) optionalWithOptions.push(attribute);
      continue;
    }
    if (attribute.options.length > 0) {
      const autorise = attribute.options.some(
        (option) => option.name.toLowerCase() === value.toLowerCase(),
      );
      if (!autorise) {
        invalid.push({
          attribute,
          value,
          reason: `Valeur non autorisée : ${attribute.options
            .slice(0, 8)
            .map((option) => option.name)
            .join(", ")}`,
        });
      }
    }
  }
  return { missing, invalid, optionalWithOptions };
}

/** Schéma de validation d'une création de produit (côté serveur). */
export const productCreationSchema = z.object({
  sellerSku: z
    .string()
    .trim()
    .min(3, "Le SKU vendeur doit faire au moins 3 caractères.")
    .max(64, "SKU vendeur trop long."),
  name: z.string().trim().min(2, "Le nom du produit est obligatoire.").max(255),
  description: z.string().trim().min(10, "La description est trop courte.").max(25_000),
  brandCode: z.string().trim().min(1, "La marque est obligatoire (Jumia l'exige)."),
  brandName: z.string().trim().min(1, "La marque est obligatoire (Jumia l'exige)."),
  categoryCode: z.string().trim().min(1, "La catégorie est obligatoire."),
  categoryName: z.string().trim().min(1, "La catégorie est obligatoire."),
  price: z.number().positive("Le prix doit être supérieur à zéro."),
  currency: z.string().trim().min(2).max(8),
  stock: z.number().int().min(0, "Le stock ne peut pas être négatif."),
  imageUrl: z.string().trim().url("L'adresse de l'image principale est invalide."),
  attributes: z
    .array(z.object({ name: z.string().trim().min(1), value: z.string().trim() }))
    .default([]),
});
export type ProductCreationInput = z.infer<typeof productCreationSchema>;
