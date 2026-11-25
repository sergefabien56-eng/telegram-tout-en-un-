import { describe, expect, it } from "vitest";
import {
  CHAMPS_A_VERIFIER,
  normalizePhotoAnalysis,
  normalizeProposals,
  parseJsonBlock,
} from "@/lib/product-assistant";
import { describeLicense, parseOpenverseResults, toCandidate } from "@/lib/product-images";

/**
 * Parcours MIMI de création de produit — règles de non-invention.
 *
 * Ces tests sont des **simulations** : aucun appel à Jumia, aucun appel à un
 * fournisseur IA, aucune image générée.
 */

describe("lecture d'une réponse JSON de modèle", () => {
  it("lit un objet JSON, même entouré d'un bloc Markdown", () => {
    expect(parseJsonBlock('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseJsonBlock('Voici : {"a": 2} — fin')).toEqual({ a: 2 });
  });

  it("refuse ce qui n'est pas un objet JSON", () => {
    expect(parseJsonBlock("pas de JSON")).toBeNull();
    expect(parseJsonBlock("[1, 2]")).toBeNull();
    expect(parseJsonBlock("{ cassé")).toBeNull();
  });
});

describe("propositions d'attributs", () => {
  it("conserve les valeurs établies et leur provenance", () => {
    const propositions = normalizeProposals([
      {
        field: "color",
        value: "Rouge",
        origin: "photo",
        reliability: "elevee",
        reason: "Couleur dominante visible.",
      },
    ]);
    expect(propositions).toHaveLength(1);
    expect(propositions[0]).toMatchObject({
      field: "color",
      value: "Rouge",
      origin: "photo",
      reliability: "elevee",
      needsHumanVerification: false,
    });
  });

  it("transforme une valeur « inconnue » en absence de valeur", () => {
    const propositions = normalizeProposals([
      { field: "main_material", value: "inconnu", origin: "photo", reliability: "elevee" },
      { field: "product_weight", value: "  ", origin: "photo", reliability: "elevee" },
    ]);
    expect(propositions.find((row) => row.field === "main_material")?.value).toBeNull();
    expect(propositions.find((row) => row.field === "product_weight")?.value).toBeNull();
  });

  it("exige une vérification humaine pour le poids et le matériau non établis", () => {
    const propositions = normalizeProposals([
      { field: "product_weight", value: "2,5 kg", origin: "deduction", reliability: "faible" },
      { field: "main_material", value: "PVC", origin: "inconnu", reliability: "inconnue" },
      { field: "color", value: "Noir", origin: "photo", reliability: "elevee" },
    ]);
    const poids = propositions.find((row) => row.field === "product_weight");
    const materiau = propositions.find((row) => row.field === "main_material");
    const couleur = propositions.find((row) => row.field === "color");
    expect(poids?.needsHumanVerification).toBe(true);
    expect(materiau?.needsHumanVerification).toBe(true);
    // La couleur, elle, est visible : elle ne demande pas de vérification.
    expect(couleur?.needsHumanVerification).toBe(false);
  });

  it("accepte le poids quand le fournisseur l'a donné", () => {
    const propositions = normalizeProposals([
      { field: "product_weight", value: "2,5 kg", origin: "fournisseur", reliability: "elevee" },
    ]);
    expect(propositions[0]?.needsHumanVerification).toBe(false);
  });

  it("ignore les champs inconnus du modèle", () => {
    const propositions = normalizeProposals([
      { field: "prix_de_vente", value: "10000", origin: "deduction", reliability: "elevee" },
    ]);
    expect(propositions).toHaveLength(0);
  });

  it("connaît les champs qui ne se déduisent pas d'une photo", () => {
    expect(CHAMPS_A_VERIFIER).toContain("product_weight");
    expect(CHAMPS_A_VERIFIER).toContain("main_material");
    expect(CHAMPS_A_VERIFIER).not.toContain("color");
  });
});

describe("analyse d'une photo", () => {
  it("ne retient que ce qui est visible et liste les inconnus", () => {
    const resultat = normalizePhotoAnalysis({
      name: "Asperseur rotatif",
      description: "Asperseur en plastique blanc, rotatif.",
      proposals: [
        { field: "color", value: "Blanc", origin: "photo", reliability: "elevee" },
        { field: "product_weight", value: null, origin: "inconnu", reliability: "inconnue" },
      ],
      unknowns: ["Poids", "Matériau exact"],
    });
    expect(resultat.nameSuggestion).toBe("Asperseur rotatif");
    expect(resultat.proposals).toHaveLength(2);
    expect(resultat.proposals.find((row) => row.field === "product_weight")?.value).toBeNull();
    expect(resultat.unknowns).toEqual(["Poids", "Matériau exact"]);
  });

  it("tolère une réponse vide", () => {
    const resultat = normalizePhotoAnalysis(null);
    expect(resultat.nameSuggestion).toBeNull();
    expect(resultat.proposals).toHaveLength(0);
    expect(resultat.unknowns).toHaveLength(0);
  });
});

describe("images Web existantes (Openverse)", () => {
  const corps = {
    results: [
      {
        id: "abc",
        title: "Perfume bottle",
        url: "https://exemple.test/perfume.jpg",
        thumbnail: "https://exemple.test/perfume-thumb.jpg",
        creator: "Photographe",
        creator_url: "https://exemple.test/auteur",
        license: "by",
        license_version: "4.0",
        license_url: "https://creativecommons.org/licenses/by/4.0/",
        foreign_landing_url: "https://exemple.test/page",
        attribution: "Photographe / CC BY 4.0",
        source: "flickr",
        width: 1200,
        height: 1600,
      },
    ],
  };

  it("lit les résultats et garde la source et la licence", () => {
    const resultats = parseOpenverseResults(corps);
    expect(resultats).toHaveLength(1);
    const candidat = toCandidate(resultats[0]!);
    expect(candidat?.url).toBe("https://exemple.test/perfume.jpg");
    expect(candidat?.license).toBe("by");
    expect(candidat?.source).toBe("flickr");
    expect(candidat?.attribution).toBe("Photographe / CC BY 4.0");
    expect(candidat?.commercialUse).toBe(true);
    expect(candidat?.attributionRequired).toBe(true);
  });

  it("marque la correspondance comme non vérifiée par défaut", () => {
    const candidat = toCandidate(parseOpenverseResults(corps)[0]!);
    expect(candidat?.correspondence).toBe("non_verifiee");
  });

  it("refuse un résultat sans adresse d'image", () => {
    expect(toCandidate({ title: "Sans URL" })).toBeNull();
  });

  it("revérifie les licences : une licence non commerciale est refusée", () => {
    expect(describeLicense({ license: "by-nc", license_version: "4.0" }).commercialUse).toBe(false);
    expect(describeLicense({ license: "by-nc-sa", license_version: "4.0" }).commercialUse).toBe(
      false,
    );
    expect(describeLicense({ license: "by", license_version: "4.0" }).commercialUse).toBe(true);
    expect(describeLicense({ license: "cc0", license_version: "1.0" }).commercialUse).toBe(true);
    expect(describeLicense({ license: "pdm", license_version: "2.0" }).commercialUse).toBe(true);
  });

  it("signale l'attribution et le partage à l'identique", () => {
    expect(describeLicense({ license: "cc0", license_version: "1.0" }).attributionRequired).toBe(
      false,
    );
    expect(describeLicense({ license: "by", license_version: "4.0" }).attributionRequired).toBe(
      true,
    );
    expect(describeLicense({ license: "by-sa", license_version: "4.0" }).shareAlike).toBe(true);
  });

  it("tolère un corps vide", () => {
    expect(parseOpenverseResults(null)).toEqual([]);
    expect(parseOpenverseResults({ results: [] })).toEqual([]);
  });
});
