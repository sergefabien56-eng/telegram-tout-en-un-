"use client";

import { Logo } from "@/components/logo";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

/**
 * Second facteur après connexion. Le `challenge` (jeton signé, 5 min) est dans
 * l'URL ; il disparaît dès que la vérification réussit.
 */
export default function TwoFactorPage() {
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("challenge") ?? "";
    if (!value) {
      // Aucun défi en cours : inutile d'afficher le formulaire.
      window.location.replace("/login");
      return;
    }
    setChallenge(value);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge, code }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Code invalide.");
        setCode("");
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      setError("Erreur réseau. Réessaye.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="flex flex-col items-center gap-2">
            <Logo className="h-10 w-10" />
            <h1 className="text-xl font-semibold text-night">Vérification en deux étapes</h1>
            <p className="text-center text-sm text-muted">
              Ouvre ton application d&apos;authentification et saisis le code à 6 chiffres,
              ou un code de secours.
            </p>
          </div>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-night">
                Code de vérification
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 9))
                }
                className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-center text-lg tracking-[0.4em] outline-none focus:border-primary-ink focus:ring-2 focus:ring-primary-ink/20"
                placeholder="123456"
              />
            </div>

            {error ? (
              <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={loading || !challenge}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {loading ? "Vérification…" : "Vérifier"}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-muted">
            <Link href="/login" className="text-primary-ink hover:underline">
              ← Retour à la connexion
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
