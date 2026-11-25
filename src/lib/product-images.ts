import { createAiProvider, readAiConfig } from "@/lib/ai/provider";

/**
 * Images de produit — **images existantes uniquement**.
 *
 * Le catalogue d'images vient d'Openverse (API publique). Aucune image n'est
 * générée : on propose des images déjà publiées, avec leur source, leur
 * licence et les conditions d'usage.
 *
 * Règles :
 * - le filtre `license_type=commercial` est appliqué **côté Openverse** ;
 * - chaque résultat est vérifié : licence, version, source, auteur ;
 * - l'attribution exigée est conservée et affichée telle quelle ;
 * - la correspondance entre l'image et le produit est contrôlée, et une
 *   image qui ne correspond pas est signalée comme telle (elle reste
 *   proposée, mais elle est marquée).
 */

/** Réponse Openverse (une partie seulement : le reste n'est pas utilisé). */
type OpenverseResult = {
  id?: unknown;
  title?: unknown;
  url?: unknown;
  thumbnail?: unknown;
  creator?: unknown;
  creator_url?: unknown;
  license?: unknown;
  license_version?: unknown;
  license_url?: unknown;
  foreign_landing_url?: unknown;
  attribution?: unknown;
  source?: unknown;
  width?: unknown;
  height?: unknown;
};

/** Une image proposée, avec ses droits. */
export type ProductImageCandidate = {
  id: string;
  title: string;
  url: string;
  thumbnail: string | null;
  creator: string | null;
  creatorUrl: string | null;
  /** Code de licence (cc0, pdm, by, by-sa…). */
  license: string;
  licenseVersion: string | null;
  licenseUrl: string | null;
  /** Source de l'image (Flickr, Wikimedia…). */
  source: string | null;
  /** Page où l'image est publiée. */
  landingUrl: string | null;
  /** Mention d'attribution à reprendre (fournie par la source). */
  attribution: string | null;
  /** L'usage commercial est-il autorisé par la licence ? */
  commercialUse: boolean;
  /** L'attribution est-elle obligatoire ? */
  attributionRequired: boolean;
  /** La licence impose-t-elle le partage à l'identique ? */
  shareAlike: boolean;
  width: number | null;
  height: number | null;
  /** Correspondance contrôlée avec le produit demandé. */
  correspondence: "correspondante" | "incertaine" | "non_correspondante" | "non_verifiee";
  /** Explication de la correspondance. */
  correspondenceReason: string;
};

/** Licences qui n'autorisent pas l'usage commercial. */
const LICENCES_NON_COMMERCIALES = new Set(["by-nc", "by-nc-sa", "by-nc-nd", "nc", "nc-sa"]);

/** Extrait les résultats Openverse d'un corps de réponse. */
export function parseOpenverseResults(body: unknown): OpenverseResult[] {
  const list = Array.isArray(body)
    ? body
    : Array.isArray((body as { results?: unknown[] })?.results)
      ? ((body as { results: unknown[] }).results ?? [])
      : [];
  return list.filter(
    (entry): entry is OpenverseResult => Boolean(entry) && typeof entry === "object",
  );
}

/**
 * Traduit une licence Openverse en conditions d'usage explicites.
 *
 * Le filtre commercial est appliqué par Openverse, mais on **revérifie**
 * chaque licence : le filtre serveur ne suffit pas à autoriser un usage.
 */
export function describeLicense(result: { license?: unknown; license_version?: unknown }): {
  commercialUse: boolean;
  attributionRequired: boolean;
  shareAlike: boolean;
} {
  const code = typeof result.license === "string" ? result.license.toLowerCase() : "";
  const version = typeof result.license_version === "string" ? result.license_version : "";
  const pdm = code === "pdm" && version.startsWith("2.");
  const cc0 = code === "cc0";
  const commercialUse = pdm || cc0 || !LICENCES_NON_COMMERCIALES.has(code);
  const attributionRequired = !cc0 && !pdm;
  const shareAlike = code.endsWith("-sa");
  return { commercialUse, attributionRequired, shareAlike };
}

/** Convertit un résultat Openverse en candidat de produit. */
export function toCandidate(result: OpenverseResult): ProductImageCandidate | null {
  const url = typeof result.url === "string" ? result.url : "";
  if (!url) return null;
  const licence = describeLicense(result);
  const creator = typeof result.creator === "string" ? result.creator : null;
  const license = typeof result.license === "string" ? result.license.toLowerCase() : "";
  const licenseVersion = typeof result.license_version === "string" ? result.license_version : null;
  const attribution =
    typeof result.attribution === "string" && result.attribution.trim()
      ? result.attribution.trim()
      : creator
        ? `${creator} — ${license.toUpperCase()}${licenseVersion ? ` ${licenseVersion}` : ""}`
        : null;
  return {
    id: typeof result.id === "string" ? result.id : url,
    title:
      typeof result.title === "string" && result.title.trim() ? result.title.trim() : "Sans titre",
    url,
    thumbnail: typeof result.thumbnail === "string" ? result.thumbnail : null,
    creator,
    creatorUrl: typeof result.creator_url === "string" ? result.creator_url : null,
    license,
    licenseVersion,
    licenseUrl: typeof result.license_url === "string" ? result.license_url : null,
    source: typeof result.source === "string" ? result.source : null,
    landingUrl: typeof result.foreign_landing_url === "string" ? result.foreign_landing_url : null,
    attribution,
    ...licence,
    width: Number.isFinite(Number(result.width)) ? Number(result.width) : null,
    height: Number.isFinite(Number(result.height)) ? Number(result.height) : null,
    correspondence: "non_verifiee",
    correspondenceReason:
      "Correspondance non vérifiée : la comparaison visuelle n'a pas pu être faite.",
  };
}

/**
 * Cherche des images existantes pour un produit.
 *
 * Le filtre `license_type=commercial` est envoyé à Openverse ; chaque
 * résultat est ensuite revalidé localement (licence non commerciale retirée).
 */
export async function searchProductImages(input: {
  query: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<{ candidates: ProductImageCandidate[]; source: string; message: string | null }> {
  const query = input.query.trim();
  if (query.length < 2) {
    return { candidates: [], source: "Openverse", message: "Indiquez au moins deux caractères." };
  }
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 20);
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("license_type", "commercial");
  url.searchParams.set("page_size", String(limit));
  url.searchParams.set("mature", "false");

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "tout-en-un-business-manager/1.0" },
      signal: input.signal ?? AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return {
        candidates: [],
        source: "Openverse",
        message: `Le catalogue d'images a refusé la recherche (HTTP ${response.status}).`,
      };
    }
    const body = (await response.json().catch(() => null)) as unknown;
    const candidats = parseOpenverseResults(body)
      .map(toCandidate)
      .filter((row): row is ProductImageCandidate => Boolean(row))
      .filter((row) => row.commercialUse);
    return {
      candidates: candidats,
      source: "Openverse",
      message:
        candidats.length === 0
          ? "Aucune image libre de droits compatible n'a été trouvée pour ce nom."
          : null,
    };
  } catch (error) {
    return {
      candidates: [],
      source: "Openverse",
      message:
        error instanceof Error
          ? `Recherche d'images impossible (${error.message}).`
          : "Recherche d'images impossible.",
    };
  }
}

/**
 * Vérifie la correspondance entre une image et le produit attendu.
 *
 * La comparaison est faite par le modèle IA, qui reçoit **l'image** et la
 * description du produit. Sans clé IA, la correspondance reste « non
 * vérifiée » : elle n'est jamais affirmée sans preuve.
 */
export async function verifyImageCorrespondence(input: {
  imageUrl: string;
  productName: string;
  productDescription?: string | null;
}): Promise<{ correspondence: ProductImageCandidate["correspondence"]; reason: string }> {
  const config = readAiConfig();
  if (!config) {
    return {
      correspondence: "non_verifiee",
      reason: "Correspondance non vérifiée : aucun fournisseur IA n'est configuré.",
    };
  }
  let imageBase64: string;
  let mimeType: string;
  try {
    const response = await fetch(input.imageUrl, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      return {
        correspondence: "non_verifiee",
        reason: `Image inaccessible (HTTP ${response.status}) : correspondance non vérifiée.`,
      };
    }
    const type = response.headers.get("content-type") ?? "";
    mimeType = type.startsWith("image/") ? (type.split(";")[0] as string) : "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());
    // On limite la taille envoyée : au-delà, la comparaison n'est plus fiable.
    if (buffer.byteLength > 4_000_000) {
      return {
        correspondence: "non_verifiee",
        reason: "Image trop volumineuse pour être analysée : correspondance non vérifiée.",
      };
    }
    imageBase64 = buffer.toString("base64");
  } catch (error) {
    return {
      correspondence: "non_verifiee",
      reason:
        error instanceof Error
          ? `Image inaccessible (${error.message}) : correspondance non vérifiée.`
          : "Image inaccessible : correspondance non vérifiée.",
    };
  }

  const provider = createAiProvider(config);
  const system = [
    "Tu vérifies qu'une photo représente bien un produit décrit.",
    "Réponds UNIQUEMENT par un objet JSON :",
    '{"correspondance": "correspondante"|"incertaine"|"non_correspondante", "raison": string}',
    "« correspondante » : la photo montre bien le produit décrit.",
    "« incertaine » : la photo pourrait correspondre sans certitude.",
    "« non_correspondante » : la photo montre autre chose.",
  ].join("\n");
  try {
    const reply = await provider.complete({
      system,
      messages: [
        {
          role: "user",
          content: [
            `Produit attendu : ${input.productName || "(non renseigné)"}`,
            `Description : ${input.productDescription || "(non renseignée)"}`,
            "Voici la photo à vérifier.",
          ].join("\n"),
          image: { mimeType, base64: imageBase64 },
        },
      ],
      tools: [],
    });
    const brut = reply.content
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const debut = brut.indexOf("{");
    const fin = brut.lastIndexOf("}");
    if (debut === -1 || fin <= debut) {
      return {
        correspondence: "non_verifiee",
        reason: "Correspondance non vérifiée : la réponse du modèle n'était pas exploitable.",
      };
    }
    const parsed = JSON.parse(brut.slice(debut, fin + 1)) as {
      correspondance?: unknown;
      raison?: unknown;
    };
    const valeur =
      parsed.correspondance === "correspondante" ||
      parsed.correspondance === "incertaine" ||
      parsed.correspondance === "non_correspondante"
        ? parsed.correspondance
        : "non_verifiee";
    return {
      correspondence: valeur,
      reason:
        typeof parsed.raison === "string" && parsed.raison.trim()
          ? parsed.raison.trim().slice(0, 300)
          : "La correspondance n'a pas pu être expliquée.",
    };
  } catch (error) {
    return {
      correspondence: "non_verifiee",
      reason:
        error instanceof Error
          ? `Vérification impossible (${error.message}).`
          : "Vérification impossible.",
    };
  }
}
