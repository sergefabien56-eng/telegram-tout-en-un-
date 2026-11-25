import { describe, expect, it } from "vitest";
import {
  emptyCatalogSyncState,
  parseAttributeSet,
  parseCategories,
  parseCatalogSyncState,
  validateAgainstAttributeSet,
} from "@/lib/jumia/catalog-referentiel";
import {
  buildCreateFeedPayload,
  mapPublicationState,
  readJumiaError,
  PUBLICATION_STATES,
} from "@/lib/jumia/product-feed";

/**
 * Création d'un produit chez Jumia — formes réelles de l'API.
 *
 * Les corps de réponse utilisés ici sont ceux **relevés en production** sur
 * l'API Vendor Center (catégories, ensembles d'attributs) : rien n'est
 * inventé.
 */

describe("normalisation des catégories Jumia", () => {
  it("lit le corps réel de GET /catalog/categories", () => {
    const corps = {
      categories: [
        {
          code: 1005677,
          name: "Sprinklers",
          hasChildren: false,
          completePath: "Industrial & Scientific / Sprinklers",
          attributeSet: {
            sid: "cc1922f9-dcba-4cd7-af72-d1560f1e44ed",
            name: "Industrial, Scientific & Power Tools",
          },
        },
      ],
      page: { current: 1, totalOfPages: 272 },
    };
    const categories = parseCategories(corps);
    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({
      code: 1005677,
      name: "Sprinklers",
      completePath: "Industrial & Scientific / Sprinklers",
      attributeSetSid: "cc1922f9-dcba-4cd7-af72-d1560f1e44ed",
    });
  });

  it("ignore les entrées incomplètes plutôt que d'échouer", () => {
    expect(parseCategories({ categories: [{ name: "Sans code" }, { code: 12 }] })).toEqual([]);
    expect(parseCategories(null)).toEqual([]);
    expect(parseCategories({ categories: [] })).toEqual([]);
  });
});

describe("normalisation des ensembles d'attributs", () => {
  const corps = {
    attributes: [
      {
        sid: "bac3047c-f2a3-46bc-864a-efce8d7cfb1b",
        code: 1000243,
        name: "age_range",
        description: "Age Range",
        type: 4,
        mandatory: false,
        variation: false,
        options: [{ name: "0-5 Years", default: false }],
      },
      {
        sid: "aaaa",
        code: 1000300,
        name: "main_material",
        type: 1,
        mandatory: true,
        variation: false,
        options: [],
      },
    ],
  };

  it("relit mandatory, type et options", () => {
    const attributes = parseAttributeSet(corps);
    expect(attributes).toHaveLength(2);
    expect(attributes[0]).toMatchObject({ name: "age_range", mandatory: false, type: 4 });
    expect(attributes[0]?.options[0]?.name).toBe("0-5 Years");
    expect(attributes[1]).toMatchObject({ name: "main_material", mandatory: true });
  });

  it("tolère un corps vide", () => {
    expect(parseAttributeSet(null)).toEqual([]);
    expect(parseAttributeSet({})).toEqual([]);
  });
});

describe("validation contre les attributs réellement exigés", () => {
  const attributes = parseAttributeSet({
    attributes: [
      { sid: "1", code: 1, name: "main_material", type: 1, mandatory: true, options: [] },
      { sid: "2", code: 2, name: "color", type: 1, mandatory: true, options: [] },
      {
        sid: "3",
        code: 3,
        name: "age_range",
        type: 4,
        mandatory: false,
        options: [{ name: "0-5 Years" }],
      },
    ],
  });

  it("exige les attributs obligatoires de la catégorie", () => {
    const resultat = validateAgainstAttributeSet({ attributes, values: [] });
    expect(resultat.missing.map((row) => row.name)).toEqual(["main_material", "color"]);
    expect(resultat.invalid).toHaveLength(0);
  });

  it("refuse une valeur qui n'est pas dans la liste autorisée", () => {
    const resultat = validateAgainstAttributeSet({
      attributes,
      values: [
        { name: "main_material", value: "ABS" },
        { name: "color", value: "Noir" },
        { name: "age_range", value: "7 ans" },
      ],
    });
    expect(resultat.missing).toHaveLength(0);
    expect(resultat.invalid).toHaveLength(1);
    expect(resultat.invalid[0]?.attribute.name).toBe("age_range");
    expect(resultat.invalid[0]?.reason).toContain("0-5 Years");
  });

  it("signale les attributs facultatifs à liste fermée", () => {
    const resultat = validateAgainstAttributeSet({
      attributes,
      values: [
        { name: "main_material", value: "ABS" },
        { name: "color", value: "Noir" },
      ],
    });
    expect(resultat.optionalWithOptions.map((row) => row.name)).toEqual(["age_range"]);
  });
});

describe("charge utile du flux de création", () => {
  const product = {
    sellerSku: "TEU-001",
    name: "Asperseur agricole PVC 50 mm",
    description: "Asperseur professionnel en PVC, rotatif 360 degrés, pour arrosage intensif.",
    brandCode: "1045133",
    brandName: "Generic",
    categoryCode: "1005677",
    categoryName: "Sprinklers",
    price: 8999,
    currency: "XOF",
    stock: 12,
    imageUrl: "https://example.test/image.jpg",
    attributes: [{ name: "main_material", value: "PVC" }],
  };

  it("reproduit le schéma officiel de POST /feeds/products/create", () => {
    const payload = buildCreateFeedPayload({
      shopId: "eb47fa58-891c-406c-a799-1303dcbd4f1b",
      product,
      businessClientCode: "jumia-ci",
    });
    expect(payload.shopId).toBe("eb47fa58-891c-406c-a799-1303dcbd4f1b");
    expect(payload.products).toHaveLength(1);
    const p = payload.products[0]!;
    expect(p.sellerSku).toBe("TEU-001");
    expect(p.parentSku).toBe("TEU-001");
    expect(p.variation).toBe("1");
    expect(p.name.value).toContain("Asperseur");
    expect(p.description.value.length).toBeGreaterThan(10);
    expect(p.images[0]).toEqual({ url: "https://example.test/image.jpg", primary: true });
    expect(p.price).toEqual({ currency: "XOF", value: 8999 });
    expect(p.stock).toBe(12);
    expect(p.attributes).toEqual([{ name: "main_material", value: "PVC" }]);
  });

  it("porte le prix sur le business client du marché local", () => {
    const payload = buildCreateFeedPayload({
      shopId: "shop-1",
      product,
      businessClientCode: "jumia-ci",
    });
    expect(payload.products[0]?.businessClients).toEqual([
      { businessClientCode: "jumia-ci", price: { currency: "XOF", value: 8999 } },
    ]);
  });

  it("n'invente pas de business client quand Jumia n'en a pas donné", () => {
    const payload = buildCreateFeedPayload({
      shopId: "shop-1",
      product,
      businessClientCode: null,
    });
    expect(payload.products[0]?.businessClients).toEqual([]);
  });

  it("renvoie les codes de marque et de catégorie comme des chaînes", () => {
    const payload = buildCreateFeedPayload({ shopId: "shop-1", product });
    // L'API renvoie des chaînes dans ses référentiels : on ne convertit pas.
    expect(payload.products[0]?.brand.code).toBe("1045133");
    expect(payload.products[0]?.category.code).toBe("1005677");
  });
});

describe("état d'une publication", () => {
  it("distingue demande envoyée, traitement, acceptée, rejetée et publiée", () => {
    expect(mapPublicationState({ feedStatus: null, failed: 0, errors: [] })).toBe("envoyee");
    expect(mapPublicationState({ feedStatus: "PENDING", failed: 0, errors: [] })).toBe(
      "en_traitement",
    );
    expect(mapPublicationState({ feedStatus: "IN_PROGRESS", failed: 0, errors: [] })).toBe(
      "en_traitement",
    );
    expect(mapPublicationState({ feedStatus: "COMPLETED", failed: 0, errors: [] })).toBe(
      "acceptee",
    );
    expect(mapPublicationState({ feedStatus: "FAILED", failed: 1, errors: [] })).toBe("rejetee");
    expect(mapPublicationState({ feedStatus: "COMPLETED", failed: 0, errors: ["x"] })).toBe(
      "rejetee",
    );
  });

  it("ne déclare « publiée » que sur preuve du catalogue et d'un QC approuvé", () => {
    const publie = mapPublicationState({
      feedStatus: "COMPLETED",
      failed: 0,
      errors: [],
      published: { qcStatus: "APPROVED", active: true, visible: true },
    });
    expect(publie).toBe("publiee");

    // Flux terminé, mais produit introuvable ou QC non approuvé : pas « publiée ».
    expect(
      mapPublicationState({
        feedStatus: "COMPLETED",
        failed: 0,
        errors: [],
        published: null,
      }),
    ).toBe("acceptee");
    expect(
      mapPublicationState({
        feedStatus: "COMPLETED",
        failed: 0,
        errors: [],
        published: { qcStatus: "PENDING", active: true, visible: true },
      }),
    ).toBe("acceptee");
    expect(
      mapPublicationState({
        feedStatus: "COMPLETED",
        failed: 0,
        errors: [],
        published: { qcStatus: "REJECTED", active: false, visible: false },
      }),
    ).toBe("rejetee");
  });

  it("documente les cinq états", () => {
    expect(Object.keys(PUBLICATION_STATES).sort()).toEqual([
      "acceptee",
      "en_traitement",
      "envoyee",
      "publiee",
      "rejetee",
    ]);
  });
});

describe("messages d'erreur Jumia", () => {
  it("reprend le message du serveur quand il existe", () => {
    expect(readJumiaError({ message: "Category not found" }, 400)).toBe("Category not found");
    expect(readJumiaError({ error: "invalid_payload" }, 400)).toBe("invalid_payload");
    expect(readJumiaError({ errors: ["a", "b"] }, 422)).toContain("a");
  });

  it("ne masque jamais l'échec derrière un succès", () => {
    expect(readJumiaError(null, 500)).toContain("500");
  });
});

describe("état du chargement du référentiel", () => {
  it("relit l'état quand la colonne jsonb rend un objet", () => {
    // C'est la forme réellement relue depuis PostgreSQL : la colonne est un
    // `jsonb`, la valeur est déjà décodée.
    const state = parseCatalogSyncState({
      complete: true,
      count: 27147,
      pages: 271,
      totalOfPages: 272,
      lastSyncAt: "2026-11-25T19:12:59.804Z",
    });
    expect(state).toEqual({
      complete: true,
      count: 27147,
      pages: 271,
      totalOfPages: 272,
      lastSyncAt: "2026-11-25T19:12:59.804Z",
    });
  });

  it("relit aussi l'état sous forme de chaîne JSON", () => {
    const state = parseCatalogSyncState(
      JSON.stringify({ complete: true, count: 12, pages: 1, totalOfPages: 1 }),
    );
    expect(state.complete).toBe(true);
    expect(state.count).toBe(12);
    expect(state.lastSyncAt).toBeNull();
  });

  it("ne pretended jamais qu'un chargement incomplet est complet", () => {
    expect(parseCatalogSyncState({ complete: false, count: 300 })).toEqual({
      complete: false,
      count: 300,
      pages: 0,
      totalOfPages: 0,
      lastSyncAt: null,
    });
  });

  it("renvoie un état neutre sur une valeur illisible", () => {
    expect(parseCatalogSyncState(null)).toEqual(emptyCatalogSyncState());
    expect(parseCatalogSyncState("pas du json")).toEqual(emptyCatalogSyncState());
    expect(parseCatalogSyncState("")).toEqual(emptyCatalogSyncState());
    expect(parseCatalogSyncState(42)).toEqual(emptyCatalogSyncState());
  });
});
