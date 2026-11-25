import { createAiProvider, readAiConfig } from "@/lib/ai/provider";

/**
 * Assistant de création de produit — MIMI.
 *
 * Trois parcours, tous encadrés par la même règle : **rien n'est inventé**.
 *
 * 1. `photo → texte` : on ne retient que ce qui est **visible** sur la photo.
 *    Le poids, la composition exacte ou le contenu du pack restent « inconnus »
 *    s'ils ne sont pas établis : le modèle doit les laisser à `null`.
 * 2. `nom → images Web` : les images proposées sont **existantes** (Openverse),
 *    avec leur source, leur licence et leurs conditions d'usage. Aucune image
 *    n'est générée.
 * 3. `informations → catégories` : les catégories proposées viennent du
 *    **référentiel Jumia réel** ; le modèle ne fait que classer parmi celles
 *    qui existent.
 *
 * Les propositions (couleur, poids, matériau, pack) portent toujours leur
 * provenance et leur fiabilité, et le poids comme le matériau exigent une
 * **vérification humaine** quand ils ne peuvent pas être établis.
 */

/** Message honnête quand aucune clé IA n'est configurée. */
export const ASSISTANT_UNAVAILABLE =
  "Analyse MIMI indisponible : aucune clé IA n'est configurée sur ce serveur. " +
  "Aucun champ n'a été deviné : renseignez la fiche à la main.";

/* -------------------------------------------------------------------------- */
/* Outils (pure)                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Extrait un objet JSON d'une réponse de modèle.
 *
 * Les modèles enclose parfois la réponse dans un bloc Markdown : on le retire
 * avant de lire le JSON, et on refuse tout ce qui n'est pas un objet.
 */
export function parseJsonBlock(text: string): Record<string, unknown> | null {
  const nettoye = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const debut = nettoye.indexOf("{");
  const fin = nettoye.lastIndexOf("}");
  if (debut === -1 || fin <= debut) return null;
  try {
    const parsed = JSON.parse(nettoye.slice(debut, fin + 1)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Champs que l'assistant sait proposer, avec leur libellé. */
export const PROPOSED_FIELDS = [
  { name: "color", label: "Couleur" },
  { name: "product_weight", label: "Poids" },
  { name: "main_material", label: "Matériau principal" },
  { name: "package_content", label: "Contenu du pack" },
] as const;

export type ProposedFieldName = (typeof PROPOSED_FIELDS)[number]["name"];

/** Provenance d'une proposition : d'où vient la valeur. */
export type ProposalOrigin = "photo" | "fournisseur" | "categorie_jumia" | "deduction" | "inconnu";

/** Fiabilité d'une proposition, du plus au moins sûr. */
export type ProposalReliability = "elevee" | "moyenne" | "faible" | "inconnue";

export type AttributeProposal = {
  field: ProposedFieldName;
  label: string;
  /** Valeur proposée, ou `null` si l'information n'a pas pu être établie. */
  value: string | null;
  origin: ProposalOrigin;
  reliability: ProposalReliability;
  /** Une vérification humaine est requise (typiquement poids et matériau). */
  needsHumanVerification: boolean;
  /** Explication courte, affichée à l'utilisateur. */
  reason: string;
};

export const ORIGIN_LABELS: Record<ProposalOrigin, string> = {
  photo: "Visible sur la photo",
  fournisseur: "Fourni par le fournisseur",
  categorie_jumia: "Déduit du référentiel Jumia",
  deduction: "Déduction MIMI",
  inconnu: "Non établi",
};

export const RELIABILITY_LABELS: Record<ProposalReliability, string> = {
  elevee: "Fiable",
  moyenne: "Probable",
  faible: "À confirmer",
  inconnue: "Inconnu",
};

/**
 * Champs dont la valeur **ne peut pas** être établie par la seule image.
 *
 * Le poids et le matériau principal ne se lisent pas sur une photo : sans
 * indication du fournisseur, ils restent inconnus et demandent une
 * vérification humaine.
 */
export const CHAMPS_A_VERIFIER: ProposedFieldName[] = ["product_weight", "main_material"];

function texteOuNull(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  if (!nettoye) return null;
  // Une valeur qui dit « inconnu » n'est pas une valeur.
  if (/^(inconnu|inconnue|unknown|n\/a|non établi|non etabli|aucun|ne sais pas)$/i.test(nettoye)) {
    return null;
  }
  return nettoye;
}

function origine(valeur: unknown): ProposalOrigin {
  switch (valeur) {
    case "photo":
      return "photo";
    case "fournisseur":
      return "fournisseur";
    case "categorie_jumia":
      return "categorie_jumia";
    case "deduction":
      return "deduction";
    default:
      return "inconnu";
  }
}

function fiabilite(valeur: unknown): ProposalReliability {
  switch (valeur) {
    case "elevee":
      return "elevee";
    case "moyenne":
      return "moyenne";
    case "faible":
      return "faible";
    default:
      return "inconnue";
  }
}

/**
 * Normalise la réponse brute du modèle en propositions exploitables.
 *
 * Règles appliquées ici (et non seulement dans l'invite) :
 * - une valeur absente ou « inconnue » devient `null` ;
 * - le poids et le matériau exigent une vérification humaine tant qu'ils ne
 *   sont pas établis ;
 * - aucune proposition n'est inventée pour un champ absent de la réponse.
 */
export function normalizeProposals(raw: unknown): AttributeProposal[] {
  const lignes = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { proposals?: unknown[] })?.proposals)
      ? ((raw as { proposals: unknown[] }).proposals ?? [])
      : [];
  const proposals: AttributeProposal[] = [];
  for (const ligne of lignes) {
    const row = ligne as {
      field?: unknown;
      value?: unknown;
      origin?: unknown;
      reliability?: unknown;
      reason?: unknown;
    };
    const field = typeof row.field === "string" ? row.field.trim() : "";
    const connu = PROPOSED_FIELDS.find((entry) => entry.name === field);
    if (!connu) continue;
    const value = texteOuNull(row.value);
    const origin = origine(row.origin);
    const reliability = fiabilite(row.reliability);
    const etabli = value !== null && origin !== "inconnu" && reliability !== "inconnue";
    const needsHumanVerification =
      CHAMPS_A_VERIFIER.includes(connu.name) && (!etabli || reliability === "faible");
    proposals.push({
      field: connu.name,
      label: connu.label,
      value,
      origin,
      reliability,
      needsHumanVerification,
      reason:
        typeof row.reason === "string" && row.reason.trim()
          ? row.reason.trim().slice(0, 300)
          : etabli
            ? "Valeur proposée par MIMI."
            : "Information non établie : à compléter ou à vérifier.",
    });
  }
  // On conserve l'ordre des champs attendus, sans doublon.
  const parNom = new Map(proposals.map((row) => [row.field, row]));
  return PROPOSED_FIELDS.map((entree) => parNom.get(entree.name)).filter(
    (row): row is AttributeProposal => Boolean(row),
  );
}

/** Résultat de l'analyse d'une photo. */
export type PhotoAnalysis = {
  /** Nom de produit suggéré (à partir de ce qui est visible). */
  nameSuggestion: string | null;
  /** Description factuelle de ce qui est visible. */
  descriptionSuggestion: string | null;
  /** Les propositions d'attributs issues de la photo. */
  proposals: AttributeProposal[];
  /** Caractéristiques qui ne sont pas établies par la photo. */
  unknowns: string[];
  /** Vrai si l'analyse a réellement eu lieu. */
  analyzed: boolean;
  /** Message honnête quand l'analyse n'a pas pu être faite. */
  message: string | null;
};

/**
 * Normalise la réponse d'analyse visuelle.
 *
 * Seules les caractéristiques **visibles** sont retenues ; tout ce que le
 * modèle présente comme incertain est renvoyé à l'utilisateur.
 */
export function normalizePhotoAnalysis(raw: unknown): Omit<PhotoAnalysis, "analyzed" | "message"> {
  const body = (raw ?? {}) as {
    name?: unknown;
    description?: unknown;
    proposals?: unknown;
    unknowns?: unknown;
  };
  const unknowns = Array.isArray(body.unknowns)
    ? body.unknowns
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.slice(0, 120))
    : [];
  return {
    nameSuggestion: texteOuNull(body.name),
    descriptionSuggestion: texteOuNull(body.description),
    proposals: normalizeProposals(body.proposals),
    unknowns,
  };
}

/* -------------------------------------------------------------------------- */
/* Appels au fournisseur IA                                                    */
/* -------------------------------------------------------------------------- */

const PHOTO_SYSTEM_PROMPT = [
  "Tu es MIMI, assistante commerciale d'une boutique en ligne.",
  "Tu analyses une photo de produit pour aider le vendeur à créer une fiche.",
  "",
  "RÈGLES ABSOLUES :",
  "1. Décris UNIQUEMENT ce qui est visible sur la photo. N'invente rien.",
  "2. Le poids, la composition exacte d'un matériau et le contenu d'un emballage",
  "   ne sont PAS déductibles d'une photo : mets-les à null et signale-les",
  "   dans « unknowns ».",
  "3. Une couleur que tu ne peux pas nommer précisément reste null.",
  "4. Réponds UNIQUEMENT par un objet JSON, sans texte autour :",
  '{"name": string|null, "description": string|null, "proposals": [{"field": "color"|"product_weight"|"main_material"|"package_content", "value": string|null, "origin": "photo"|"inconnu", "reliability": "elevee"|"moyenne"|"faible"|"inconnue", "reason": string}], "unknowns": string[]}',
].join("\n");

const PROPOSITIONS_SYSTEM_PROMPT = [
  "Tu es MIMI, assistante commerciale d'une boutique en ligne.",
  "Tu proposes les attributs d'une fiche produit à partir d'informations",
  "données par le vendeur (nom, description, informations fournisseur) et",
  "d'une analyse de photo éventuellement fournie.",
  "",
  "RÈGLES ABSOLUES :",
  "1. N'invente aucune valeur. Si l'information n'est pas donnée, la valeur",
  '   est null et l\'origine est "inconnu".',
  "2. Le poids et le matériau principal ne sont jamais déductibles d'une photo :",
  "   sans indication explicite du fournisseur, ils restent inconnus.",
  "3. Pour chaque proposition, indique la provenance (photo, fournisseur,",
  "   categorie_jumia, deduction, inconnu) et la fiabilité (elevee, moyenne,",
  "   faible, inconnue).",
  "4. Réponds UNIQUEMENT par un objet JSON, sans texte autour :",
  '{"proposals": [{"field": "color"|"product_weight"|"main_material"|"package_content", "value": string|null, "origin": "photo"|"fournisseur"|"categorie_jumia"|"deduction"|"inconnu", "reliability": "elevee"|"moyenne"|"faible"|"inconnue", "reason": string}]}',
].join("\n");

/** Analyse une photo (base64) : uniquement ce qui est visible. */
export async function analyzeProductPhoto(input: {
  imageBase64: string;
  mimeType: string;
  nameHint?: string;
}): Promise<PhotoAnalysis> {
  const config = readAiConfig();
  if (!config) {
    return {
      nameSuggestion: null,
      descriptionSuggestion: null,
      proposals: [],
      unknowns: [],
      analyzed: false,
      message: ASSISTANT_UNAVAILABLE,
    };
  }
  const provider = createAiProvider(config);
  try {
    const reply = await provider.complete({
      system: PHOTO_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: input.nameHint
            ? `Voici la photo du produit. Le vendeur l'appelle « ${input.nameHint} ». Analyse-la.`
            : "Voici la photo du produit. Analyse-la.",
          image: { mimeType: input.mimeType, base64: input.imageBase64 },
        },
      ],
      tools: [],
    });
    const raw = parseJsonBlock(reply.content);
    if (!raw) {
      return {
        nameSuggestion: null,
        descriptionSuggestion: null,
        proposals: [],
        unknowns: [],
        analyzed: false,
        message:
          "MIMI n'a pas renvoyé de description exploitable : la fiche reste à compléter à la main.",
      };
    }
    const normalise = normalizePhotoAnalysis(raw);
    return { ...normalise, analyzed: true, message: null };
  } catch (error) {
    return {
      nameSuggestion: null,
      descriptionSuggestion: null,
      proposals: [],
      unknowns: [],
      analyzed: false,
      message:
        error instanceof Error
          ? `Analyse MIMI impossible (${error.message}). Aucun champ n'a été deviné.`
          : "Analyse MIMI impossible. Aucun champ n'a été deviné.",
    };
  }
}

/** Propose les attributs à partir des informations fournisseur et d'une photo. */
export async function proposeProductAttributes(input: {
  name: string;
  description?: string | null;
  supplierInfo?: string | null;
  photoSummary?: string | null;
}): Promise<{ proposals: AttributeProposal[]; message: string | null }> {
  const config = readAiConfig();
  if (!config) {
    return { proposals: [], message: ASSISTANT_UNAVAILABLE };
  }
  const provider = createAiProvider(config);
  const details = [
    `Nom du produit : ${input.name || "(non renseigné)"}`,
    `Description du vendeur : ${input.description || "(non renseignée)"}`,
    `Informations fournisseur : ${input.supplierInfo || "(non renseignées)"}`,
    `Analyse de photo : ${input.photoSummary || "(aucune)"}`,
  ].join("\n");
  try {
    const reply = await provider.complete({
      system: PROPOSITIONS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: details }],
      tools: [],
    });
    const raw = parseJsonBlock(reply.content);
    if (!raw) {
      return {
        proposals: [],
        message: "MIMI n'a pas proposé d'attributs exploitables : les champs restent à saisir.",
      };
    }
    return { proposals: normalizeProposals(raw), message: null };
  } catch (error) {
    return {
      proposals: [],
      message:
        error instanceof Error
          ? `Propositions MIMI indisponibles (${error.message}). Aucun champ n'a été deviné.`
          : "Propositions MIMI indisponibles. Aucun champ n'a été deviné.",
    };
  }
}

/**
 * Classement de catégories **parmi celles qui existent**.
 *
 * Le modèle ne peut proposer qu'un code présent dans la liste reçue : tout
 * code inconnu est ignoré. Aucune catégorie n'est donc inventée.
 */
export async function classifyCategories(input: {
  candidates: { code: number; name: string; completePath: string }[];
  name: string;
  description?: string | null;
  photoSummary?: string | null;
}): Promise<{
  chosen: { code: number; name: string; completePath: string }[];
  message: string | null;
}> {
  const config = readAiConfig();
  if (!config) {
    return { chosen: [], message: ASSISTANT_UNAVAILABLE };
  }
  if (input.candidates.length === 0) {
    return {
      chosen: [],
      message:
        "Aucune catégorie du référentiel Jumia ne correspond : rechargez le référentiel des catégories.",
    };
  }
  const provider = createAiProvider(config);
  const liste = input.candidates.map((row) => `- ${row.code} : ${row.completePath}`).join("\n");
  const system = [
    "Tu es MIMI, assistante commerciale d'une boutique en ligne.",
    "Tu classes un produit dans le référentiel réel de Jumia.",
    "RÈGLES ABSOLUES :",
    "1. Tu ne peux choisir qu'un code présent dans la liste fournie.",
    "2. Si aucune catégorie ne convient, renvoie une liste vide.",
    '3. Réponds UNIQUEMENT par un objet JSON : {"codes": [nombre, ...]}',
    "   avec au plus trois codes, du plus pertinent au moins pertinent.",
  ].join("\n");
  try {
    const reply = await provider.complete({
      system,
      messages: [
        {
          role: "user",
          content: [
            `Produit : ${input.name || "(non renseigné)"}`,
            `Description : ${input.description || "(non renseignée)"}`,
            `Photo : ${input.photoSummary || "(aucune)"}`,
            "Catégories disponibles :",
            liste,
          ].join("\n"),
        },
      ],
      tools: [],
    });
    const raw = parseJsonBlock(reply.content);
    const codes = Array.isArray(raw?.codes) ? raw?.codes : [];
    const connus = new Set(input.candidates.map((row) => row.code));
    const chosen = codes
      .map((code) => Number(code))
      .filter((code) => Number.isFinite(code) && connus.has(code))
      .slice(0, 3)
      .map((code) => input.candidates.find((row) => row.code === code)!);
    if (chosen.length === 0) {
      return {
        chosen: [],
        message:
          "MIMI n'a pas trouvé de catégorie correspondante dans le référentiel : choisissez-la vous-même.",
      };
    }
    return { chosen, message: null };
  } catch (error) {
    return {
      chosen: [],
      message:
        error instanceof Error
          ? `Classement MIMI indisponible (${error.message}). Choisissez la catégorie vous-même.`
          : "Classement MIMI indisponible. Choisissez la catégorie vous-même.",
    };
  }
}
