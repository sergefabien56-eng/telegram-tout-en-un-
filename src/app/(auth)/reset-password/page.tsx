"use client";

import { Logo } from "@/components/logo";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string; details?: string[] };
      if (!response.ok || !payload.ok) {
        setError(payload.details?.[0] ?? payload.error ?? "Réinitialisation impossible.");
        return;
      }
      setDone(true);
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          Mot de passe modifié.
        </p>
        <Link
          href="/login"
          className="block w-full rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-primary-hover"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={onSubmit}>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-night">
          Nouveau mot de passe
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary-ink focus:ring-2 focus:ring-primary-ink/20"
          placeholder="8 caractères minimum, avec un chiffre"
        />
      </div>
      {error ? (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
      >
        {loading ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="flex flex-col items-center gap-2">
            <Logo className="h-10 w-10" />
            <h1 className="text-xl font-semibold text-night">Nouveau mot de passe</h1>
          </div>
          {token ? (
            <Suspense fallback={null}>
              <ResetForm token={token} />
            </Suspense>
          ) : (
            <p className="mt-6 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              Lien invalide : le jeton est manquant.
            </p>
          )}
          <p className="mt-6 text-center text-sm text-muted">
            <Link href="/login" className="font-medium text-primary-ink hover:underline">
              Retour à la connexion
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
