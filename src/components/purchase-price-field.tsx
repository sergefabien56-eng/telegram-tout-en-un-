"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Props = {
  shopId: string;
  sku: string;
  /** Valeur affichée en unités majeures (FCFA) ; vide si non renseignée. */
  value: string;
  currency: string;
};

/**
 * Saisie manuelle du prix d'achat d'une déclinaison.
 * Rien n'est repris de Jumia : c'est l'utilisateur qui renseigne le montant.
 */
export function PurchasePriceField({
  shopId,
  sku,
  value,
  currency,
  permissions,
}: Props & { permissions: boolean }) {
  const router = useRouter();
  const [price, setPrice] = useState(value);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (!permissions) {
    return <span className="text-xs text-muted">{value || "—"}</span>;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setState("saving");
    setMessage(null);
    const numeric = price.trim() === "" ? null : Number(price.replace(",", "."));
    try {
      const response = await fetch(`/api/shops/${shopId}/prix-achat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, price: numeric }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setState("error");
        setMessage(payload.error ?? "Enregistrement impossible.");
        return;
      }
      setState("idle");
      setMessage(numeric === null ? "Prix d'achat effacé." : "Prix d'achat enregistré.");
      router.refresh();
    } catch {
      setState("error");
      setMessage("Erreur réseau.");
    }
  }

  return (
    <form onSubmit={save} className="flex items-center gap-2">
      <input
        type="text"
        inputMode="decimal"
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        aria-label={`Prix d'achat ${sku} (${currency})`}
        placeholder="—"
        className="focusable w-24 rounded-lg border border-border bg-card px-2 py-1 text-right text-sm text-night"
      />
      <button
        type="submit"
        disabled={state === "saving"}
        className="focusable rounded-lg border border-primary-600 px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50"
      >
        {state === "saving" ? "…" : "OK"}
      </button>
      {message ? (
        <span className={state === "error" ? "text-xs text-danger" : "text-xs text-success"}>
          {message}
        </span>
      ) : null}
    </form>
  );
}
