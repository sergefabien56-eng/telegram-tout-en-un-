"use client";

import { useState } from "react";
import { Image as ImageIcon, Loader2, Sparkles, TriangleAlert } from "lucide-react";

/**
 * Assistant de création de produit — les trois parcours MIMI.
 *
 * 1. **Photo → texte** : on ne retient que ce qui est visible ; le poids et le
 *    matériau restent inconnus s'ils ne sont pas établis.
 * 2. **Nom → images Web** : les images proposées sont **existantes**
 *    (Openverse), avec source, licence et conditions d'usage. La
 *    correspondance avec le produit est contrôlée avant d'être affirmée.
 * 3. **Informations fournisseur → catégories et attributs** : les catégories
 *    viennent du référentiel Jumia réel ; les propositions d'attributs
 *    portent leur provenance et leur fiabilité.
 *
 * Rien n'est généré, rien n'est inventé : toute proposition reste
 * modifiable, et le poids comme le matériau demandent une validation
 * humaine explicite.
 */

type Proposal = {
  field: string;
  label: string;
  value: string | null;
  origin: string;
  reliability: string;
  needsHumanVerification: boolean;
  reason: string;
};

type ImageCandidate = {
  id: string;
  title: string;
  url: string;
  thumbnail: string | null;
  creator: string | null;
  license: string;
  licenseVersion: string | null;
  licenseUrl: string | null;
  source: string | null;
  landingUrl: string | null;
  attribution: string | null;
  commercialUse: boolean;
  attributionRequired: boolean;
  shareAlike: boolean;
  correspondence: string;
  correspondenceReason: string;
};

type CategoryChoice = {
  code: number;
  name: string;
  completePath: string;
  attributeSetName?: string | null;
};

const ORIGIN_LABELS: Record<string, string> = {
  photo: "Visible sur la photo",
  fournisseur: "Fourni par le fournisseur",
  categorie_jumia: "Déduit du référentiel Jumia",
  deduction: "Déduction MIMI",
  inconnu: "Non établi",
};

const RELIABILITY_LABELS: Record<string, string> = {
  elevee: "Fiable",
  moyenne: "Probable",
  faible: "À confirmer",
  inconnue: "Inconnu",
};

const CORRESPONDENCE_LABELS: Record<string, string> = {
  correspondante: "Correspondance confirmée",
  incertaine: "Correspondance incertaine",
  non_correspondante: "Ne correspond pas",
  non_verifiee: "Correspondance non vérifiée",
};

export function MimiProductAssistant({
  shopId,
  name,
  description,
  onApplyName,
  onApplyDescription,
  onApplyProposals,
  onApplyImage,
  onApplyCategory,
}: {
  shopId: string;
  name: string;
  description: string;
  onApplyName: (value: string) => void;
  onApplyDescription: (value: string) => void;
  onApplyProposals: (proposals: Proposal[]) => void;
  onApplyImage: (url: string, attribution: string | null) => void;
  onApplyCategory: (category: CategoryChoice) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Parcours 1
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoDescription, setPhotoDescription] = useState<string | null>(null);
  const [photoUnknowns, setPhotoUnknowns] = useState<string[]>([]);
  const [photoProposals, setPhotoProposals] = useState<Proposal[]>([]);

  // Parcours 2
  const [imageQuery, setImageQuery] = useState(name);
  const [images, setImages] = useState<ImageCandidate[]>([]);
  const [imageSource, setImageSource] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageCandidate | null>(null);
  const [correspondence, setCorrespondence] = useState<{
    url: string;
    resultat: string;
    raison: string;
  } | null>(null);

  // Parcours 3
  const [supplierInfo, setSupplierInfo] = useState("");
  const [attributeProposals, setAttributeProposals] = useState<Proposal[]>([]);
  const [categoryChoices, setCategoryChoices] = useState<CategoryChoice[]>([]);
  const [categoryCandidates, setCategoryCandidates] = useState<CategoryChoice[]>([]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch(`/api/shops/${shopId}/produits/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      data?: Record<string, unknown>;
    } | null;
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error ?? "Opération impossible.");
    }
    return payload.data ?? {};
  }

  /* ---------------------------------------------------------------------- */
  /* Parcours 1 — photo → texte                                             */
  /* ---------------------------------------------------------------------- */

  async function onPhoto(file: File) {
    setBusy("photo");
    setError(null);
    setNotice(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
        reader.readAsDataURL(file);
      });
      const [meta, base64] = dataUrl.split(",");
      const mimeType = meta?.includes(";")
        ? meta.split(";")[0]!.replace("data:", "")
        : "image/jpeg";
      if (!base64) throw new Error("Photo illisible.");
      const data = await post({
        action: "photo",
        imageBase64: base64,
        mimeType,
        name,
      });
      setPhotoName(typeof data.nameSuggestion === "string" ? data.nameSuggestion : null);
      setPhotoDescription(
        typeof data.descriptionSuggestion === "string" ? data.descriptionSuggestion : null,
      );
      setPhotoUnknowns(Array.isArray(data.unknowns) ? (data.unknowns as string[]) : []);
      setPhotoProposals(Array.isArray(data.proposals) ? (data.proposals as Proposal[]) : []);
      setNotice(
        "Analyse terminée. Seules les caractéristiques visibles ont été retenues : relisez avant d'appliquer.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyse impossible.");
    } finally {
      setBusy(null);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Parcours 2 — nom → images Web existantes                              */
  /* ---------------------------------------------------------------------- */

  async function onSearchImages() {
    setBusy("images");
    setError(null);
    setNotice(null);
    setSelectedImage(null);
    setCorrespondence(null);
    try {
      const data = await post({ action: "images", query: imageQuery });
      const candidats = Array.isArray(data.candidates) ? (data.candidates as ImageCandidate[]) : [];
      setImages(candidats);
      setImageSource(typeof data.source === "string" ? data.source : null);
      if (typeof data.message === "string") setNotice(data.message);
      if (candidats.length === 0) {
        setError("Aucune image libre de droits compatible n'a été trouvée pour ce nom.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recherche impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function onVerifyImage(candidate: ImageCandidate) {
    setBusy("verifier");
    setError(null);
    try {
      const data = await post({
        action: "verifier-image",
        imageUrl: candidate.url,
        name,
        description,
      });
      setCorrespondence({
        url: candidate.url,
        resultat: typeof data.correspondance === "string" ? data.correspondance : "non_verifiee",
        raison: typeof data.reason === "string" ? data.reason : "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vérification impossible.");
    } finally {
      setBusy(null);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Parcours 3 — informations fournisseur                                  */
  /* ---------------------------------------------------------------------- */

  async function onProposeAttributes() {
    setBusy("attributs");
    setError(null);
    setNotice(null);
    try {
      const data = await post({
        action: "attributs",
        name,
        description,
        supplierInfo,
        photoSummary: photoDescription,
      });
      const propositions = Array.isArray(data.proposals) ? (data.proposals as Proposal[]) : [];
      setAttributeProposals(propositions);
      if (typeof data.message === "string") setNotice(data.message);
      if (propositions.length === 0) {
        setError("Aucune proposition n'a pu être établie à partir de ces informations.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Propositions indisponibles.");
    } finally {
      setBusy(null);
    }
  }

  async function onSuggestCategories() {
    setBusy("categories");
    setError(null);
    setNotice(null);
    try {
      const data = await post({
        action: "categories",
        name,
        description,
        photoSummary: photoDescription,
        query: name,
      });
      const choisi = Array.isArray(data.chosen) ? (data.chosen as CategoryChoice[]) : [];
      const candidats = Array.isArray(data.candidates) ? (data.candidates as CategoryChoice[]) : [];
      setCategoryChoices(choisi);
      setCategoryCandidates(candidats);
      if (typeof data.message === "string") setNotice(data.message);
      if (choisi.length === 0) {
        setError(
          "Aucune catégorie du référentiel Jumia n'a pu être retenue : choisissez-la dans la liste.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classement indisponible.");
    } finally {
      setBusy(null);
    }
  }

  const indisponible = !shopId;

  return (
    <div className="space-y-5">
      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          {notice}
        </p>
      ) : null}
      {indisponible ? (
        <p className="rounded-lg bg-surface px-3 py-2 text-sm text-muted">
          Choisissez d&apos;abord une boutique : l&apos;assistant travaille dans le cadre d&apos;une
          boutique.
        </p>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Parcours 1                                                        */}
      {/* ---------------------------------------------------------------- */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-night">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Parcours 1 · Une photo suffit
        </h3>
        <p className="mt-1 text-xs text-muted">
          MIMI décrit ce qui est <strong>visible</strong>. Le poids, la composition exacte et le
          contenu de l&apos;emballage ne se lisent pas sur une photo : ils restent inconnus tant que
          le fournisseur ne les donne pas.
        </p>
        <label className="mt-3 block text-xs font-medium text-muted">
          Photo du produit
          <input
            type="file"
            accept="image/*"
            disabled={indisponible || busy === "photo"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onPhoto(file);
            }}
            className="focusable mt-1 block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-sm file:font-medium file:text-night"
          />
        </label>
        {busy === "photo" ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Analyse de la photo…
          </p>
        ) : null}
        {photoName || photoDescription ? (
          <div className="mt-3 space-y-2 rounded-lg bg-surface p-3">
            {photoName ? (
              <p className="text-sm text-night">
                <span className="font-medium">Nom proposé :</span> {photoName}
              </p>
            ) : null}
            {photoDescription ? (
              <p className="text-sm text-night">
                <span className="font-medium">Description proposée :</span> {photoDescription}
              </p>
            ) : null}
            {photoUnknowns.length > 0 ? (
              <p className="text-xs text-muted">
                Non établis par la photo : {photoUnknowns.join(", ")}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              {photoName ? (
                <button
                  type="button"
                  onClick={() => onApplyName(photoName)}
                  className="focusable rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-night hover:bg-surface"
                >
                  Appliquer le nom
                </button>
              ) : null}
              {photoDescription ? (
                <button
                  type="button"
                  onClick={() => onApplyDescription(photoDescription)}
                  className="focusable rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-night hover:bg-surface"
                >
                  Appliquer la description
                </button>
              ) : null}
              {photoProposals.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onApplyProposals(photoProposals)}
                  className="focusable rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-night hover:bg-surface"
                >
                  Appliquer les attributs visibles
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Parcours 2                                                        */}
      {/* ---------------------------------------------------------------- */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-night">
          <ImageIcon className="h-4 w-4" aria-hidden="true" />
          Parcours 2 · Des images déjà publiées
        </h3>
        <p className="mt-1 text-xs text-muted">
          Les images proposées existent déjà sur le Web
          {imageSource ? ` (source : ${imageSource})` : ""}. Chaque proposition indique sa source,
          sa licence et l&apos;attribution à reprendre. Aucune image n&apos;est générée.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-medium text-muted">
            Nom du produit
            <input
              type="search"
              value={imageQuery}
              onChange={(event) => setImageQuery(event.target.value)}
              placeholder="ex. ventilateur de table"
              className="focusable w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
            />
          </label>
          <button
            type="button"
            onClick={() => void onSearchImages()}
            disabled={indisponible || busy === "images" || imageQuery.trim().length < 2}
            className="focusable inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-night hover:bg-surface disabled:opacity-60"
          >
            {busy === "images" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Chercher des images
          </button>
        </div>

        {images.length > 0 ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {images.map((image) => (
              <li key={image.id} className="rounded-lg border border-border p-3">
                {image.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.thumbnail}
                    alt={image.title}
                    className="h-32 w-full rounded-lg object-cover"
                    loading="lazy"
                  />
                ) : null}
                <p className="mt-2 text-xs font-medium text-night">{image.title}</p>
                <p className="text-[11px] text-muted">
                  {image.source ?? "Source inconnue"} · licence {image.license.toUpperCase()}
                  {image.licenseVersion ? ` ${image.licenseVersion}` : ""}
                  {image.creator ? ` · ${image.creator}` : ""}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  Usage commercial : {image.commercialUse ? "autorisé" : "non autorisé"} ·
                  attribution : {image.attributionRequired ? "obligatoire" : "non requise"}
                  {image.shareAlike ? " · partage à l'identique" : ""}
                </p>
                {image.attribution ? (
                  <p className="mt-1 text-[11px] italic text-muted">« {image.attribution} »</p>
                ) : null}
                {image.landingUrl ? (
                  <a
                    href={image.landingUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="focusable mt-1 inline-block text-[11px] text-primary-600 underline"
                  >
                    Voir la page source
                  </a>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedImage(image);
                      onApplyImage(image.url, image.attribution);
                    }}
                    className="focusable rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
                  >
                    Choisir cette image
                  </button>
                  <button
                    type="button"
                    onClick={() => void onVerifyImage(image)}
                    disabled={busy === "verifier"}
                    className="focusable rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-night hover:bg-surface disabled:opacity-60"
                  >
                    Vérifier la correspondance
                  </button>
                </div>
                {correspondence && correspondence.url === image.url ? (
                  <p className="mt-2 text-[11px] text-muted">
                    <span className="font-medium text-night">
                      {CORRESPONDENCE_LABELS[correspondence.resultat] ?? correspondence.resultat}
                    </span>
                    {correspondence.raison ? ` — ${correspondence.raison}` : ""}
                  </p>
                ) : null}
                {selectedImage?.id === image.id ? (
                  <p className="mt-2 text-[11px] text-success">Image sélectionnée.</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Parcours 3                                                        */}
      {/* ---------------------------------------------------------------- */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-night">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          Parcours 3 · Vos informations fournisseur
        </h3>
        <p className="mt-1 text-xs text-muted">
          À partir de ce que vous écrivez (et de la photo si elle a été analysée), MIMI classe le
          produit dans le <strong>référentiel Jumia réel</strong> et propose les attributs attendus.
        </p>
        <label className="mt-3 block text-xs font-medium text-muted">
          Informations fournisseur (matière, poids, contenu du pack…)
          <textarea
            value={supplierInfo}
            onChange={(event) => setSupplierInfo(event.target.value)}
            rows={3}
            placeholder="ex. Fabriqué en PVC, weighs 2,5 kg, contient 1 rotational sprinkler"
            className="focusable mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onProposeAttributes()}
            disabled={indisponible || busy === "attributs"}
            className="focusable inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-night hover:bg-surface disabled:opacity-60"
          >
            {busy === "attributs" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Proposer les attributs
          </button>
          <button
            type="button"
            onClick={() => void onSuggestCategories()}
            disabled={indisponible || busy === "categories"}
            className="focusable inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-night hover:bg-surface disabled:opacity-60"
          >
            {busy === "categories" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Proposer une catégorie Jumia
          </button>
        </div>

        {attributeProposals.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {attributeProposals.map((proposal) => (
              <li key={proposal.field} className="rounded-lg bg-surface p-3">
                <p className="text-sm font-medium text-night">
                  {proposal.label} : {proposal.value ?? "non établi"}
                </p>
                <p className="text-[11px] text-muted">
                  Provenance : {ORIGIN_LABELS[proposal.origin] ?? proposal.origin} · Fiabilité :{" "}
                  {RELIABILITY_LABELS[proposal.reliability] ?? proposal.reliability}
                </p>
                <p className="text-[11px] text-muted">{proposal.reason}</p>
                {proposal.needsHumanVerification ? (
                  <p className="mt-1 text-[11px] font-medium text-warning">
                    Vérification humaine requise : cette valeur n&apos;est pas établie, elle doit
                    être confirmée par le vendeur.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {categoryChoices.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted">
              Catégories proposées (référentiel Jumia) :
            </p>
            <ul className="mt-2 space-y-2">
              {categoryChoices.map((choice) => (
                <li key={choice.code} className="rounded-lg bg-surface p-3">
                  <p className="text-sm text-night">{choice.completePath}</p>
                  <p className="text-[11px] text-muted">Identifiant Jumia : {choice.code}</p>
                  <button
                    type="button"
                    onClick={() => onApplyCategory(choice)}
                    className="focusable mt-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-night hover:bg-surface"
                  >
                    Utiliser cette catégorie
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {categoryChoices.length === 0 && categoryCandidates.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted">
              Catégories du référentiel correspondant à la recherche :
            </p>
            <ul className="mt-2 space-y-1">
              {categoryCandidates.slice(0, 10).map((candidate) => (
                <li key={candidate.code}>
                  <button
                    type="button"
                    onClick={() => onApplyCategory(candidate)}
                    className="focusable w-full rounded-lg border border-border px-3 py-2 text-left text-xs text-night hover:bg-surface"
                  >
                    {candidate.completePath} ({candidate.code})
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
