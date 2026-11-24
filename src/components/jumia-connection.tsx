"use client";

import { useState } from "react";
import { PlugZap } from "lucide-react";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string; detail: string }
  | { kind: "error"; message: string };

/**
 * Test de connexion Vendor Center Jumia (propriétaires uniquement).
 * Le serveur n'affiche jamais le refresh token.
 */
export function JumiaConnection() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function run() {
    setStatus({ kind: "loading" });
    try {
      const response = await fetch("/api/admin/jumia/test", { method: "POST" });
      const payload = (await response.json()) as {
        ok?: boolean;
        data?: {
          source: string;
          expiresIn: number;
          refreshExpiresIn: number | null;
          shopsStatus: number | null;
          shopCount: number | null;
        };
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        setStatus({ kind: "error", message: payload.error ?? "Échec inattendu." });
        return;
      }
      if (!payload.data) {
        setStatus({ kind: "error", message: "Réponse incomplète du serveur." });
        return;
      }
      const data = payload.data;
      const detail = [
        `source : ${data.source}`,
        `access token valable ${data.expiresIn} s`,
        data.refreshExpiresIn === null
          ? "refresh sans durée annoncée"
          : `refresh valable ${Math.round(data.refreshExpiresIn / 86400)} j`,
        data.shopsStatus === null
          ? "lecture des boutiques non aboutie"
          : data.shopCount === null
            ? `boutiques : réponse ${data.shopsStatus}`
            : `${data.shopCount} boutique(s) Jumia accessible(s)`,
      ].join(" · ");
      setStatus({
        kind: "success",
        message: "Connexion Jumia établie.",
        detail,
      });
    } catch {
      setStatus({ kind: "error", message: "Réseau indisponible pendant le test." });
    }
  }

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-night">
        <PlugZap className="h-4 w-4" aria-hidden="true" />
        Connexion Jumia (Vendor Center)
      </h2>
      <p className="mt-2 text-sm text-muted">
        Vérifie l&apos;échange d&apos;un refresh token contre un access token et ré-écrit le nouveau
        jeton en base, chiffré. Aucun identifiant n&apos;est affiché.
      </p>

      <button
        type="button"
        onClick={run}
        disabled={status.kind === "loading"}
        className="focusable mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status.kind === "loading" ? "Test en cours…" : "Tester la connexion Jumia"}
      </button>

      {status.kind === "success" ? (
        <p role="status" className="mt-3 text-sm text-success">
          {status.message} <span className="text-muted">{status.detail}</span>
        </p>
      ) : null}
      {status.kind === "error" ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {status.message}
        </p>
      ) : null}
    </section>
  );
}
