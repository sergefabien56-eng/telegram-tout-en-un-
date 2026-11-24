"use client";

import { useState, type FormEvent } from "react";

/**
 * Formulaire de création de boutique (Jumia).
 * Utilisé sur la page Boutiques et dans les actions rapides de la barre du haut.
 */
export function ShopCreateForm({
  onCreated,
  onCancel,
  idPrefix = "shop",
}: {
  onCreated?: () => void;
  onCancel?: () => void;
  /** Préfixe des `id` de champs, pour éviter les doublons dans la page. */
  idPrefix?: string;
}) {
  const [name, setName] = useState("");
  const [externalShopId, setExternalShopId] = useState("");
  const [country, setCountry] = useState("CI");
  const [currency, setCurrency] = useState("XOF");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, externalShopId, country, currency, platform: "jumia" }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        details?: string[];
        data?: { id: string };
      };
      if (!response.ok || !payload.ok) {
        setError(payload.details?.[0] ?? payload.error ?? "Création impossible.");
        return;
      }
      setName("");
      setExternalShopId("");
      onCreated?.();
    } catch {
      setError("Erreur réseau. Réessaye.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={onSubmit}
      aria-describedby={error ? `${idPrefix}-error` : undefined}
    >
      <div>
        <label htmlFor={`${idPrefix}-name`} className="mb-1 block text-xs font-medium text-night">
          Nom
        </label>
        <input
          id={`${idPrefix}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary-ink"
          placeholder="Ma boutique Jumia"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-external`}
          className="mb-1 block text-xs font-medium text-night"
        >
          Identifiant boutique Jumia{" "}
          <span className="font-normal text-muted">(facultatif)</span>
        </label>
        <input
          id={`${idPrefix}-external`}
          value={externalShopId}
          onChange={(event) => setExternalShopId(event.target.value)}
          autoComplete="off"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary-ink"
          placeholder="Laisser vide : identifiant interne généré"
        />
        <p className="mt-1 text-[11px] text-muted">
          Inutile de le chercher : la liaison à Jumia se fait après, depuis « Connexions
          Jumia ».
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={`${idPrefix}-country`}
            className="mb-1 block text-xs font-medium text-night"
          >
            Pays
          </label>
          <input
            id={`${idPrefix}-country`}
            value={country}
            onChange={(event) => setCountry(event.target.value.toUpperCase())}
            maxLength={2}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm uppercase outline-none focus:border-primary-ink"
          />
        </div>
        <div>
          <label
            htmlFor={`${idPrefix}-currency`}
            className="mb-1 block text-xs font-medium text-night"
          >
            Devise
          </label>
          <input
            id={`${idPrefix}-currency`}
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            maxLength={3}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm uppercase outline-none focus:border-primary-ink"
          />
        </div>
      </div>

      {error ? (
        <p
          id={`${idPrefix}-error`}
          className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 pt-1 sm:flex-row">
        <button
          type="submit"
          disabled={loading}
          className="focusable flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {loading ? "Création…" : "Créer la boutique"}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="focusable rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-night hover:bg-surface"
          >
            Annuler
          </button>
        ) : null}
      </div>
    </form>
  );
}
