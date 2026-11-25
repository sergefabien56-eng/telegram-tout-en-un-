"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Package, RefreshCw, Search, Send, TriangleAlert } from "lucide-react";
import { MimiProductAssistant } from "@/components/mimi-product-assistant";

type Shop = {
  id: string;
  name: string;
  currency: string;
  remoteShopId: string | null;
  role: string;
};

type Category = {
  code: number;
  name: string;
  completePath: string;
  attributeSetSid: string | null;
  attributeSetName: string | null;
};

type Attribute = {
  sid: string;
  name: string;
  description: string | null;
  mandatory: boolean;
  variation: boolean;
  options: { name: string; default: boolean }[];
};

type CatalogState = {
  complete: boolean;
  count: number;
  pages: number;
  totalOfPages: number;
  lastSyncAt: string | null;
};

type Publication = {
  id: string;
  sellerSku: string;
  status: string;
  statusLabel: string;
  statusDetail: string;
  feedId: string | null;
  feedStatus: string | null;
  qcStatus: string | null;
  errors: string[];
  submittedAt: string;
};

type Proposal = {
  field: string;
  label: string;
  value: string | null;
  origin: string;
  reliability: string;
  needsHumanVerification: boolean;
  reason: string;
};

/**
 * Champs conseillés par le cahier des charges, reliés aux **noms d'attributs
 * Jumia réels** relevés sur les produits des boutiques (pas une liste
 * supposée : ce sont les noms que Jumia attend).
 */
const CHAMPS_CONSEILLES = [
  { name: "color", label: "Couleur", aide: "Teinte dominante du produit." },
  { name: "product_weight", label: "Poids", aide: "Poids du produit (unité : kg ou g)." },
  {
    name: "main_material",
    label: "Matériau principal",
    aide: "Matière dominante. À ne renseigner que si elle est connue.",
  },
  {
    name: "package_content",
    label: "Contenu du pack",
    aide: "Ce que contient l’emballage (liste, en toutes lettres).",
  },
];

/** Marques « sans marque » reconnues officiellement par Jumia. */
const MARQUES_OFFICIELLES = [
  { code: 1045133, name: "Generic" },
  { code: 1039426, name: "Fashion" },
];

/**
 * « Ajouter un produit ».
 *
 * Le parcours est celui du cahier des charges : une boutique, une fiche
 * rattachée, une **vérification humaine** avant l'envoi, puis l'envoi à
 * Jumia. La publication est asynchrone : on n'affiche jamais « publié » au
 * clic.
 */
export function ProductCreationForm({ shopIdPreselected }: { shopIdPreselected?: string }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState(shopIdPreselected ?? "");
  const [catalogue, setCatalogue] = useState<CatalogState | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>({});

  const [marques, setMarques] = useState<{ code: number; name: string }[]>([]);
  const [brandCode, setBrandCode] = useState("1045133");
  const [brandName, setBrandName] = useState("Generic");

  const [name, setName] = useState("");
  const [sellerSku, setSellerSku] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("XOF");
  const [stock, setStock] = useState("0");
  const [imageUrl, setImageUrl] = useState("");
  const [imageAttribution, setImageAttribution] = useState<string | null>(null);

  /** Attributs proposés par MIMI qui attendent une validation humaine. */
  const [propositionsAValider, setPropositionsAValider] = useState<Proposal[]>([]);
  const [validees, setValidees] = useState<Record<string, boolean>>({});
  const [confirmation, setConfirmation] = useState(false);

  const [publications, setPublications] = useState<Publication[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const boutique = useMemo(() => shops.find((shop) => shop.id === shopId) ?? null, [shops, shopId]);

  /* ---------------------------------------------------------------------- */
  /* Chargements                                                            */
  /* ---------------------------------------------------------------------- */

  const loadShops = useCallback(async () => {
    try {
      const response = await fetch("/api/shops");
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        data?: Shop[];
      } | null;
      if (response.ok && payload?.ok) {
        const disponibles = payload.data ?? [];
        setShops(disponibles);
        // La boutique présélectionnée doit exister : une identifiant inconnu
        // (lien forgé, boutique supprimée) est ignoré, jamais conservé.
        // Aucune boutique n'est choisie d'office : le vendeur choisit celle
        // qui portera le produit.
        setShopId((prev) => (prev && disponibles.some((shop) => shop.id === prev) ? prev : ""));
      }
    } catch {
      setError("Erreur réseau pendant le chargement des boutiques.");
    }
  }, []);

  const loadCatalog = useCallback(
    async (query: string) => {
      if (!shopId) return;
      try {
        const response = await fetch(
          `/api/shops/${shopId}/catalogue/referentiel?type=categories&q=${encodeURIComponent(query)}`,
        );
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          data?: { categories?: Category[]; state?: CatalogState };
        } | null;
        if (response.ok && payload?.ok && payload.data) {
          setCategories(payload.data.categories ?? []);
          setCatalogue(payload.data.state ?? null);
        }
      } catch {
        setError("Erreur réseau pendant la lecture du référentiel.");
      }
    },
    [shopId],
  );

  const loadAttributes = useCallback(
    async (code: number) => {
      if (!shopId) return;
      try {
        const response = await fetch(
          `/api/shops/${shopId}/catalogue/referentiel?type=attributs&category=${code}`,
        );
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          data?: { attributes?: Attribute[] };
          error?: string;
        } | null;
        if (!response.ok || !payload?.ok) {
          setAttributes([]);
          setError(payload?.error ?? "Lecture des attributs impossible.");
          return;
        }
        setAttributes(payload.data?.attributes ?? []);
      } catch {
        setError("Erreur réseau pendant la lecture des attributs.");
      }
    },
    [shopId],
  );

  const loadPublications = useCallback(async () => {
    if (!shopId) return;
    try {
      const response = await fetch(`/api/shops/${shopId}/produits/publications`);
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        data?: { publications?: Publication[] };
      } | null;
      if (response.ok && payload?.ok) setPublications(payload.data?.publications ?? []);
    } catch {
      // La liste reste vide : aucun chiffre n'est inventé.
    }
  }, [shopId]);

  useEffect(() => {
    void loadShops();
  }, [loadShops]);

  useEffect(() => {
    void loadCatalog(categoryQuery);
    void loadPublications();
  }, [loadCatalog, loadPublications, categoryQuery]);

  useEffect(() => {
    if (!shopId) return;
    void fetch(`/api/shops/${shopId}/catalogue/referentiel?type=marques`)
      .then((response) => response.json())
      .then((payload: { ok?: boolean; data?: { marques?: { code: number; name: string }[] } }) => {
        if (payload.ok && payload.data?.marques) setMarques(payload.data.marques);
      })
      .catch(() => setMarques([]));
  }, [shopId]);

  useEffect(() => {
    if (boutique?.currency) setCurrency(boutique.currency);
  }, [boutique]);

  // Pendant un rechargement en arrière-plan, l'état avance tout seul.
  useEffect(() => {
    if (!catalogue || catalogue.complete) return;
    const timer = setInterval(() => void loadCatalog(categoryQuery), 5000);
    return () => clearInterval(timer);
  }, [catalogue, categoryQuery, loadCatalog]);

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                */
  /* ---------------------------------------------------------------------- */

  async function refreshCatalog() {
    if (!shopId) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/shops/${shopId}/catalogue/referentiel`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        data?: { message?: string };
      } | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "Rechargement impossible.");
        return;
      }
      setMessage(payload.data?.message ?? "Rechargement du référentiel lancé en arrière-plan.");
    } catch {
      setError("Erreur réseau pendant le rechargement.");
    } finally {
      setBusy(false);
    }
  }

  function choisirCategorie(choix: Category) {
    setCategory(choix);
    setAttributeValues({});
    setAttributes([]);
    setPropositionsAValider([]);
    setValidees({});
    void loadAttributes(choix.code);
  }

  /**
   * Applique les propositions de MIMI.
   *
   * Les valeurs sont **reprises mais jamais imposées** : le vendeur peut les
   * corriger. Les propositions de poids et de matériau exigent une
   * validation explicite avant l'envoi.
   */
  function appliquerPropositions(propositions: Proposal[]) {
    const avecValeur = propositions.filter((row) => row.value !== null);
    setAttributeValues((prev) => {
      const suivant = { ...prev };
      for (const row of avecValeur) {
        if (suivant[row.field] === undefined || suivant[row.field] === "") {
          suivant[row.field] = row.value as string;
        }
      }
      return suivant;
    });
    const aValider = propositions.filter((row) => row.needsHumanVerification);
    setPropositionsAValider(aValider);
    setValidees({});
    setConfirmation(false);
  }

  async function envoyer() {
    // Garde-fou : la boutique doit exister dans la liste réellement chargée.
    if (!shopId || !boutique) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/shops/${shopId}/produits/publications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sellerSku,
          description,
          brandCode,
          brandName,
          categoryCode: String(category?.code ?? ""),
          categoryName: category?.name ?? "",
          price: Number(price),
          currency,
          stock: Number(stock),
          imageUrl,
          attributes: Object.entries(attributeValues)
            .filter(([, value]) => value.trim() !== "")
            .map(([key, value]) => ({ name: key, value })),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        data?: { message?: string };
      } | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "Envoi impossible.");
        return;
      }
      setMessage(
        payload.data?.message ??
          "Demande envoyée. Le produit n'est pas encore publié : le traitement et le contrôle qualité sont en cours.",
      );
      setName("");
      setSellerSku("");
      setDescription("");
      setImageUrl("");
      setImageAttribution(null);
      setPropositionsAValider([]);
      setConfirmation(false);
      await loadPublications();
    } catch {
      setError("Erreur réseau pendant l'envoi.");
    } finally {
      setBusy(false);
    }
  }

  async function rafraichir(publicationId: string) {
    if (!shopId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/shops/${shopId}/produits/publications/${publicationId}`);
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        data?: { publication?: Publication; refreshError?: string | null };
      } | null;
      if (response.ok && payload?.ok && payload.data?.publication) {
        setPublications((prev) =>
          prev.map((row) => (row.id === publicationId ? payload.data!.publication! : row)),
        );
      }
    } catch {
      setError("Erreur réseau pendant le rafraîchissement.");
    } finally {
      setBusy(false);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Rendu                                                                   */
  /* ---------------------------------------------------------------------- */

  const attributsObligatoires = attributes.filter((attribute) => attribute.mandatory);
  const champsPresents = CHAMPS_CONSEILLES.filter((champ) =>
    attributes.some((attribute) => attribute.name === champ.name),
  );
  const autresObligatoires = attributsObligatoires.filter(
    (attribute) => !CHAMPS_CONSEILLES.some((champ) => champ.name === attribute.name),
  );

  const champsManquants = attributsObligatoires.filter(
    (attribute) => (attributeValues[attribute.name] ?? "").trim() === "",
  );
  const validationsManquantes = propositionsAValider.filter((row) => validees[row.field] !== true);

  const complet = Boolean(
    boutique &&
    category &&
    name.trim() &&
    sellerSku.trim() &&
    description.trim() &&
    Number(price) > 0 &&
    imageUrl.trim() &&
    champsManquants.length === 0 &&
    validationsManquantes.length === 0 &&
    confirmation,
  );

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          {message}
        </p>
      ) : null}

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">1 · Boutique</h2>
        <p className="mt-1 text-xs text-muted">
          Un produit est toujours rattaché à une boutique : il est publié sur le compte vendeur de
          cette boutique.
        </p>
        <label className="mt-3 block text-xs font-medium text-muted">
          Boutique
          <select
            value={shopId}
            onChange={(event) => {
              setShopId(event.target.value);
              setCategory(null);
              setAttributes([]);
              setAttributeValues({});
              setPropositionsAValider([]);
              setConfirmation(false);
            }}
            className="focusable mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
          >
            <option value="">Choisir une boutique…</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
                {shop.remoteShopId ? "" : " (non rattachée à Jumia)"}
              </option>
            ))}
          </select>
        </label>
        {boutique && !boutique.remoteShopId ? (
          <p className="mt-2 flex items-start gap-2 text-xs text-warning">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Cette boutique n&apos;est rattachée à aucune boutique Jumia : rattachez-la avant de
            publier un produit.
          </p>
        ) : null}
        {!boutique && shops.length === 0 ? (
          <p className="mt-2 text-xs text-muted">
            Aucune boutique disponible : ajoutez d&apos;abord une boutique Jumia. Un produit doit
            être rattaché à une boutique.
          </p>
        ) : null}
        {!boutique && shops.length > 0 ? (
          <p className="mt-2 text-xs text-muted">
            Choisissez la boutique qui portera ce produit : l&apos;envoi est refusé tant
            qu&apos;aucune boutique n&apos;est sélectionnée.
          </p>
        ) : null}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">2 · Préparer la fiche avec MIMI</h2>
        <p className="mt-1 text-xs text-muted">
          Trois parcours possibles. Tout ce que MIMI propose reste modifiable : aucune valeur
          n&apos;est envoyée sans votre accord.
        </p>
        <div className="mt-4">
          <MimiProductAssistant
            shopId={shopId}
            name={name}
            description={description}
            onApplyName={setName}
            onApplyDescription={setDescription}
            onApplyProposals={appliquerPropositions}
            onApplyImage={(url, attribution) => {
              setImageUrl(url);
              setImageAttribution(attribution);
            }}
            onApplyCategory={(choice) =>
              choisirCategorie({
                code: choice.code,
                name: choice.name,
                completePath: choice.completePath,
                attributeSetSid: null,
                attributeSetName: choice.attributeSetName ?? null,
              })
            }
          />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">3 · Catégorie Jumia</h2>
        <p className="mt-1 text-xs text-muted">
          La catégorie détermine les champs <strong>réellement exigés</strong> par Jumia. Elle est
          choisie dans le référentiel réel de la plateforme.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-medium text-muted">
            Rechercher une catégorie
            <span className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={categoryQuery}
                onChange={(event) => setCategoryQuery(event.target.value)}
                placeholder="ex. sac à main"
                className="focusable w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-night"
              />
            </span>
          </label>
          <button
            type="button"
            onClick={() => void refreshCatalog()}
            disabled={busy || !shopId}
            className="focusable inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-night hover:bg-surface disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
            Recharger le référentiel
          </button>
        </div>

        {catalogue ? (
          <p className="mt-2 text-xs text-muted">
            Référentiel : {catalogue.count} catégories chargées
            {catalogue.complete
              ? " (chargement complet)"
              : catalogue.pages > 0
                ? ` (chargement en cours : ${catalogue.pages}/${catalogue.totalOfPages || "?"} pages)`
                : " (jamais chargé)"}
            {catalogue.lastSyncAt
              ? ` · dernier chargement ${new Date(catalogue.lastSyncAt).toLocaleString("fr-FR")}`
              : ""}
            . Les catégories proviennent de l&apos;API Jumia Vendor Center.
          </p>
        ) : null}

        {categories.length > 0 ? (
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border">
            {categories.map((row) => (
              <li key={row.code}>
                <button
                  type="button"
                  onClick={() => choisirCategorie(row)}
                  className={`focusable w-full px-3 py-2 text-left text-xs hover:bg-surface ${
                    category?.code === row.code ? "bg-primary-50 font-medium" : ""
                  }`}
                >
                  <span className="text-night">{row.name}</span>
                  <span className="block text-[11px] text-muted">{row.completePath}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : shopId ? (
          <p className="mt-3 text-xs text-muted">
            Aucune catégorie ne correspond. Rechargez le référentiel si nécessaire.
          </p>
        ) : null}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">4 · Informations du produit</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-muted">
            Nom du produit
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="focusable mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
            />
          </label>
          <label className="block text-xs font-medium text-muted">
            SKU vendeur
            <input
              type="text"
              value={sellerSku}
              onChange={(event) => setSellerSku(event.target.value)}
              placeholder="Identifiant unique chez vous"
              className="focusable mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
            />
          </label>
          <label className="block text-xs font-medium text-muted">
            Marque
            <select
              value={`${brandCode}|${brandName}`}
              onChange={(event) => {
                const [code, libelle] = event.target.value.split("|");
                setBrandCode(code ?? "");
                setBrandName(libelle ?? "");
              }}
              className="focusable mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
            >
              {[...MARQUES_OFFICIELLES, ...marques].map((marque) => (
                <option key={marque.code} value={`${marque.code}|${marque.name}`}>
                  {marque.name} ({marque.code})
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-muted">
              Prix
              <input
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                className="focusable mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
              />
            </label>
            <label className="block text-xs font-medium text-muted">
              Devise
              <input
                type="text"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                className="focusable mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-muted">
            Stock
            <input
              type="number"
              min={0}
              value={stock}
              onChange={(event) => setStock(event.target.value)}
              className="focusable mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
            />
          </label>
          <label className="block text-xs font-medium text-muted">
            Image principale (adresse publique)
            <input
              type="url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://…"
              className="focusable mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
            />
          </label>
          {imageAttribution ? (
            <p className="text-[11px] text-muted sm:col-span-2">
              Attribution de l&apos;image à conserver : « {imageAttribution} »
            </p>
          ) : null}
          <label className="block text-xs font-medium text-muted sm:col-span-2">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="focusable mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
            />
          </label>
        </div>
      </section>

      {category ? (
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-night">
            5 · Attributs exigés par « {category.name} »
          </h2>
          <p className="mt-1 text-xs text-muted">
            {attributsObligatoires.length > 0
              ? `${attributsObligatoires.length} attribut(s) obligatoire(s) selon Jumia pour cette catégorie.`
              : "Aucun attribut obligatoire signalé par Jumia pour cette catégorie."}{" "}
            L&apos;ensemble d&apos;attributs provient de l&apos;API Vendor Center.
          </p>

          {champsPresents.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {champsPresents.map((champ) => {
                const attribute = attributes.find((row) => row.name === champ.name);
                return (
                  <label key={champ.name} className="block text-xs font-medium text-muted">
                    {champ.label}
                    {attribute?.mandatory ? " (obligatoire)" : ""}
                    <input
                      type="text"
                      value={attributeValues[champ.name] ?? ""}
                      onChange={(event) =>
                        setAttributeValues((prev) => ({
                          ...prev,
                          [champ.name]: event.target.value,
                        }))
                      }
                      className="focusable mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
                    />
                    <span className="mt-1 block text-[11px] text-muted">{champ.aide}</span>
                  </label>
                );
              })}
            </div>
          ) : null}

          {autresObligatoires.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {autresObligatoires.map((attribute) => (
                <label key={attribute.name} className="block text-xs font-medium text-muted">
                  {attribute.name} (obligatoire)
                  {attribute.options.length > 0 ? (
                    <select
                      value={attributeValues[attribute.name] ?? ""}
                      onChange={(event) =>
                        setAttributeValues((prev) => ({
                          ...prev,
                          [attribute.name]: event.target.value,
                        }))
                      }
                      className="focusable mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
                    >
                      <option value="">Choisir…</option>
                      {attribute.options.map((option) => (
                        <option key={option.name} value={option.name}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={attributeValues[attribute.name] ?? ""}
                      onChange={(event) =>
                        setAttributeValues((prev) => ({
                          ...prev,
                          [attribute.name]: event.target.value,
                        }))
                      }
                      className="focusable mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-night"
                    />
                  )}
                </label>
              ))}
            </div>
          ) : null}

          {propositionsAValider.length > 0 ? (
            <div className="mt-5 rounded-lg border border-warning/40 bg-warning/5 p-4">
              <p className="text-sm font-semibold text-night">Vérification humaine requise</p>
              <p className="mt-1 text-xs text-muted">
                Ces valeurs ne sont pas établies : elles ne peuvent pas être déduites d&apos;une
                photo. Corrigez-les si nécessaire, puis confirmez.
              </p>
              <ul className="mt-3 space-y-2">
                {propositionsAValider.map((proposal) => (
                  <li key={proposal.field} className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-night">
                      {proposal.label} : {proposal.value ?? "non établi"}
                    </span>
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={validees[proposal.field] === true}
                        onChange={(event) =>
                          setValidees((prev) => ({
                            ...prev,
                            [proposal.field]: event.target.checked,
                          }))
                        }
                        className="focusable h-4 w-4 rounded border-border"
                      />
                      Je confirme cette valeur
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-night">6 · Aperçu et envoi</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Boutique</dt>
            <dd className="text-night">{boutique?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Catégorie</dt>
            <dd className="text-night">
              {category ? `${category.completePath} (${category.code})` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Nom · SKU</dt>
            <dd className="text-night">
              {name || "—"} · {sellerSku || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Marque</dt>
            <dd className="text-night">
              {brandName} ({brandCode})
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Prix · stock</dt>
            <dd className="text-night">
              {price || "—"} {currency} · {stock || "0"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Attributs renseignés</dt>
            <dd className="text-night">
              {Object.values(attributeValues).filter((value) => value.trim() !== "").length}
            </dd>
          </div>
        </dl>

        {imageUrl ? (
          <div className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Aperçu de l'image du produit"
              className="h-40 w-full max-w-xs rounded-lg border border-border object-contain"
            />
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted">
            Aucune image sélectionnée : une image est requise pour la fiche.
          </p>
        )}

        <label className="mt-4 flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={confirmation}
            onChange={(event) => setConfirmation(event.target.checked)}
            className="focusable mt-0.5 h-4 w-4 rounded border-border"
          />
          J&apos;ai vérifié les informations et l&apos;image de cette fiche.
        </label>

        <p className="mt-3 text-xs text-muted">
          La création chez Jumia est <strong>asynchrone</strong> : l&apos;envoi lance un flux qui
          est traité en arrière-plan, puis la fiche passe un contrôle qualité. Le produit ne sera
          affiché comme « publié » qu&apos;après vérification dans le catalogue Jumia.
        </p>
        <button
          type="button"
          onClick={() => void envoyer()}
          disabled={!complet || busy}
          className="focusable mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {busy ? "Envoi en cours…" : "Envoyer à Jumia"}
        </button>
        {!complet ? (
          <p className="mt-2 text-xs text-muted">
            Renseignez la boutique, la catégorie, le nom, le SKU, la description, le prix,
            l&apos;image principale et les attributs obligatoires, puis confirmez la fiche pour
            pouvoir envoyer.
            {champsManquants.length > 0
              ? ` Attributs manquants : ${champsManquants.map((row) => row.name).join(", ")}.`
              : ""}
            {validationsManquantes.length > 0
              ? ` Vérifications humaines restantes : ${validationsManquantes
                  .map((row) => row.label)
                  .join(", ")}.`
              : ""}
          </p>
        ) : null}
      </section>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-night">
          <Package className="h-4 w-4" aria-hidden="true" />
          Demandes envoyées
        </h2>
        {publications.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Aucune demande envoyée pour cette boutique.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {publications.map((publication) => (
              <li key={publication.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-night">{publication.sellerSku}</p>
                    <p className="text-xs text-muted">
                      {publication.statusLabel} — {publication.statusDetail}
                    </p>
                    <p className="text-xs text-muted">
                      Envoye le {new Date(publication.submittedAt).toLocaleString("fr-FR")}
                      {publication.feedId ? ` · flux ${publication.feedId}` : ""}
                      {publication.qcStatus ? ` · QC ${publication.qcStatus}` : ""}
                    </p>
                    {publication.errors.length > 0 ? (
                      <ul className="mt-1 list-disc pl-4 text-xs text-danger">
                        {publication.errors.slice(0, 5).map((message, index) => (
                          <li key={index}>{message}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void rafraichir(publication.id)}
                    disabled={busy}
                    className="focusable inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-night hover:bg-surface disabled:opacity-60"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Vérifier chez Jumia
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
